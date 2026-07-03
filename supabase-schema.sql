-- ====================================================================
-- IMMO DAKAR TRANSPORT - SCHEMA DE BASE DE DONNÉES SUPABASE
-- ====================================================================

-- 1. Nettoyage (optionnel en cas de réinitialisation)
-- DROP TABLE IF EXISTS billets CASCADE;
-- DROP TABLE IF EXISTS tarifs CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP TABLE IF EXISTS compteur_billets CASCADE;

-- 2. Table profiles (étend auth.users de Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  prenom text not null,
  role text not null check (role in ('admin', 'commercial')),
  actif boolean default true,
  created_at timestamptz default now()
);

-- 3. Grille tarifaire configurable par l'admin
create table tarifs (
  id uuid primary key default gen_random_uuid(),
  climatisation text not null check (climatisation in ('climatise', 'non_climatise')),
  escorte text not null check (escorte in ('avec_escorte', 'sans_escorte')),
  prix numeric not null check (prix >= 0),
  actif boolean default true,
  unique (climatisation, escorte, actif)
);

-- 4. Billets de transport
create table billets (
  id uuid primary key default gen_random_uuid(),
  numero_billet text unique not null, -- Format: IMD-AAAA-NNNNNN
  nom_passager text not null,
  prenom_passager text not null,
  telephone text not null,
  date_depart date not null,
  heure_depart time not null,
  climatisation text not null check (climatisation in ('climatise', 'non_climatise')),
  escorte text not null check (escorte in ('avec_escorte', 'sans_escorte')),
  montant numeric not null check (montant >= 0),
  statut text not null default 'valide' check (statut in ('valide', 'utilise', 'annule')),
  signature_qr text not null,
  cree_par uuid references profiles(id) on delete set null,
  cree_par_nom text, -- Nom affiché du commercial émetteur (dénormalisé pour performance)
  scanne_par uuid references profiles(id) on delete set null,
  scanne_le timestamptz,
  annule_par uuid references profiles(id) on delete set null,
  annule_le timestamptz,
  envoye boolean default false,
  envoye_le timestamptz,
  envoye_par uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- 5. Compteur atomique pour le numéro de billet par année
create table compteur_billets (
  annee int primary key,
  dernier_numero int not null default 0
);

-- ====================================================================
-- SÉCURITÉ : Row Level Security (RLS) & Politiques d'accès
-- ====================================================================

-- Activation de RLS sur toutes les tables
alter table profiles enable row level security;
alter table tarifs enable row level security;
alter table billets enable row level security;
alter table compteur_billets enable row level security;

-- --- Politiques pour la table PROFILES ---
-- Tout utilisateur authentifié peut lire les profils (requis pour afficher l'émetteur, etc.)
create policy "Lecture des profils pour les authentifiés"
  on profiles for select
  to authenticated
  using (true);

-- Seul l'admin peut insérer/modifier/supprimer des profils de commerciaux
create policy "Admin controle total sur les profils"
  on profiles for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- --- Politiques pour la table TARIFS ---
-- Tout le monde peut lire la grille tarifaire active
create policy "Lecture des tarifs pour tous les connectés"
  on tarifs for select
  to authenticated
  using (true);

-- Seul l'admin peut modifier la grille tarifaire
create policy "Admin contrôle total des tarifs"
  on tarifs for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- --- Politiques pour la table BILLETS ---
-- Un commercial peut voir uniquement les billets qu'il a créés ou scannés
-- L'admin peut voir TOUS les billets
create policy "Lecture des billets selon rôle"
  on billets for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
    or cree_par = auth.uid()
    or scanne_par = auth.uid()
  );

-- Un commercial peut insérer des billets s'il est actif
create policy "Insertion des billets pour commerciaux actifs"
  on billets for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and actif = true
    )
    and (cree_par = auth.uid())
  );

-- RLS restreint la modification directe par le client
-- La mise à jour du statut d'un billet s'effectue via le Worker (clé service_role),
-- ou l'admin direct si nécessaire.
create policy "Admin modification des billets"
  on billets for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- --- Politiques pour la table COMPTEUR_BILLETS ---
-- Cette table est strictement réservée au backend (Worker avec service_role).
-- Aucune politique d'accès client n'est créée, garantissant un accès refusé par défaut.

-- ====================================================================
-- INITIALISATION DES TARIFS PAR DÉFAUT
-- ====================================================================
insert into tarifs (climatisation, escorte, prix, actif) values
  ('non_climatise', 'sans_escorte', 10000, true),
  ('climatise',     'sans_escorte', 12500, true),
  ('non_climatise', 'avec_escorte', 12500, true),
  ('climatise',     'avec_escorte', 15000, true)
on conflict (climatisation, escorte, actif) do update set prix = excluded.prix;

-- ====================================================================
-- TRIGGER AUTOMATIQUE POUR SYNCHRONISER LES USERS AUTH ET LES PROFILES
-- ====================================================================
-- Ce trigger insère automatiquement un profil lors de la création d'un utilisateur dans auth.users.
-- Utile pour l'API Supabase standard. Le rôle par défaut est 'commercial'.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nom, prenom, role, actif)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', 'Utilisateur'),
    coalesce(new.raw_user_meta_data->>'prenom', 'Nouveau'),
    coalesce(new.raw_user_meta_data->>'role', 'commercial'),
    true
  );
  return new;
end;
$$ language plpgsql security definer;

-- Association du trigger
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute procedure public.handle_new_user();

-- ====================================================================
-- FONCTION STOCKÉE : INCRÉMENTEUR ATOMIQUE DE NUMÉRO DE BILLET
-- ====================================================================
create or replace function incrementer_compteur(p_annee int)
returns int as $$
declare
  v_dernier int;
begin
  insert into compteur_billets (annee, dernier_numero)
  values (p_annee, 1)
  on conflict (annee) do update
  set dernier_numero = compteur_billets.dernier_numero + 1
  returning dernier_numero into v_dernier;
  return v_dernier;
end;
$$ language plpgsql security definer;

-- ====================================================================
-- INITIALISATION DU COMPTE ADMINISTRATEUR
-- Exécutez cette requête APRÈS avoir créé l'utilisateur admin
-- dans Supabase Auth > Users, en remplaçant l'UUID ci-dessous.
-- ====================================================================
-- INSERT INTO profiles (id, nom, prenom, role, actif)
-- VALUES (
--   'REMPLACER-PAR-UUID-DU-COMPTE-ADMIN',
--   'Principal',
--   'Admin',
--   'admin',
--   true
-- );

-- ====================================================================
-- CORRECTION : Ajouter cree_par_nom si la table existe déjà
-- (À exécuter si vous avez déjà créé la table sans cette colonne)
-- ====================================================================
-- ALTER TABLE billets ADD COLUMN IF NOT EXISTS cree_par_nom text;
