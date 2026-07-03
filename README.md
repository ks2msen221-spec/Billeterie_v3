# 🎫 ImmoDakar Transport - Plateforme de Billetterie Sécurisée

Cette plateforme permet de générer, signer de manière cryptographique et contrôler à l'embarquement des billets de transport infalsifiables. Elle s'appuie sur une architecture Serverless hautement sécurisée et économique (0 FCFA de coût d'infrastructure).

---

## 🚀 Architecture Technique de Production
- **Front-end** : Application React (Vite / Tailwind CSS) hébergée sur **Cloudflare Pages** (Offre gratuite)
- **Backend / Logique sensible** : **Cloudflare Workers** qui gère la cryptographie HMAC-SHA256, les numéros de série atomiques et l'accès sécurisé à Supabase.
- **Base de Données & Auth** : **Supabase** (PostgreSQL avec RLS activée, Supabase Auth et Supabase Storage pour les billets PDF/HTML).
- **Sécurité** : Signature cryptographique HMAC-SHA256, jetons JWT à durée courte, blocage automatique temporaire après 5 tentatives de connexion échouées.

---

## 🛠️ Guide de Déploiement

### Étape 1 : Configuration du projet Supabase
1. Créez un projet gratuit sur [Supabase](https://supabase.com).
2. Ouvrez l'onglet **SQL Editor** dans votre tableau de bord Supabase et exécutez le script du fichier `supabase-schema.sql` fourni à la racine de ce dépôt. Ce script :
   - Crée les tables nécessaires (`profiles`, `tarifs`, `billets`, `compteur_billets`).
   - Active la sécurité **Row Level Security (RLS)**.
   - Initialise les tarifs officiels par défaut.
   - Configure la synchronisation automatique des profils.
3. Allez dans **Project Settings > API** pour copier l'URL de votre projet (`SUPABASE_URL`) et la clé secrète d'administration (`service_role` key).
4. Pour permettre l'incrémentation atomique du numéro de billet, créez la fonction stockée PostgreSQL suivante sur Supabase :
   ```sql
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
   ```

### Étape 2 : Déploiement du Cloudflare Worker
1. Créez un compte gratuit sur [Cloudflare](https://cloudflare.com).
2. Déployez un nouveau Worker à l'aide de l'outil CLI Wrangler ou directement depuis le tableau de bord en important le code du fichier `cloudflare-worker.js`.
3. Ajoutez les variables d'environnement suivantes dans les secrets de votre Worker Cloudflare (`Settings > Variables > Secrets`) :
   - `HMAC_SECRET` : Une clé secrète forte pour signer les QR Codes.
   - `SUPABASE_URL` : L'URL de votre API Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY` : Votre clé secrète `service_role` Supabase.

### Étape 3 : Déploiement du Frontend sur Cloudflare Pages
1. Liez votre dépôt GitHub à **Cloudflare Pages**.
2. Configurez les paramètres de build suivants :
   - **Framework preset** : `Vite`
   - **Build command** : `npm run build`
   - **Build output directory** : `dist`
3. Ajoutez les variables d'environnement dans le panneau Pages si vous utilisez des connexions directes, sinon Pages va router toutes ses requêtes d'API vers le Worker Cloudflare déployé à l'étape 2.

---

## 🔐 Sécurité & Intégrité
1. **Signature HMAC-SHA256** : Chaque QR code contient les données du billet concaténées et signées avec la clé `HMAC_SECRET`. Lors du scan, le Worker recalcule la signature locale. Si le QR Code a été modifié à la main, il est instantanément refusé.
2. **Double Validation** : Même si un billet possède une signature cryptographique valide, son statut est vérifié en base. S'il est marqué `utilise` ou `annule`, l'embarquement est refusé avec une alerte rouge.
3. **Lockout Anti-Brute Force** : Un compteur enregistre les tentatives échouées de connexion par email. Après 5 tentatives infructueuses, le compte est temporairement verrouillé pendant 15 minutes.
