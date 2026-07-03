/**
 * CLOUDFLARE WORKER - PLATEFORME SECURISEE IMMO DAKAR TRANSPORT
 * 
 * Ce fichier contient le code complet de l'API et du service d'impression pour Cloudflare Workers.
 * Il gère à la fois le mode local (développement via db-mock.json) et la production (Supabase).
 */

const fsName = 'fs';
let fsModule = null;

// Tenter d'importer dynamiquement 'fs' uniquement si on tourne dans un environnement Node.js (Vite Dev Server)
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    fsModule = await import(/* @vite-ignore */ fsName);
  } catch (e) {
    // Ignorer si indisponible
  }
}

const DB_FILE = typeof process !== 'undefined' && process.cwd ? (process.cwd() + '/db-mock.json') : './db-mock.json';

// --- GESTION DE LA BASE DE DONNÉES SIMULÉE (LOCAL DEV) ---
function readDB() {
  if (fsModule && fsModule.existsSync(DB_FILE)) {
    try {
      const data = fsModule.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error("Erreur de lecture de la base mock locale", e);
    }
  }

  // Base par défaut avec l'administrateur SEED
  const defaultDB = {
    profiles: [
      {
        id: "admin-uuid-1111-2222",
        nom: "Principal",
        prenom: "Admin",
        email: "immodakar@proton.me",
        role: "admin",
        actif: true,
        // Mot de passe "Anopatuy2w" haché en SHA-256
        passwordHash: "468c4a5c0d29623e1b12b59663ff9e56dc9f9a2b5e024fc8b99fe51a37c0245f",
        created_at: new Date().toISOString()
      },
      {
        id: "comm-uuid-1111-2222",
        nom: "Ndiaye",
        prenom: "Moussa",
        email: "commercial1@immodakar.sn",
        role: "commercial",
        actif: true,
        // Mot de passe "commercial123" haché en SHA-256
        passwordHash: "9a0083501a3fa4613ffda733a4664db136b6cb600e5e01f2f0120152914fb0f8",
        created_at: new Date().toISOString()
      }
    ],
    tarifs: [
      { id: "t1", climatisation: "non_climatise", escorte: "sans_escorte", prix: 10000, actif: true },
      { id: "t2", climatisation: "climatise", escorte: "sans_escorte", prix: 12500, actif: true },
      { id: "t3", climatisation: "non_climatise", escorte: "avec_escorte", prix: 12500, actif: true },
      { id: "t4", climatisation: "climatise", escorte: "avec_escorte", prix: 15000, actif: true }
    ],
    billets: [
      {
        id: "b1",
        numero_billet: "IMD-2026-000482",
        nom_passager: "Ndiaye",
        prenom_passager: "Moussa",
        telephone: "771234567",
        date_depart: "2026-07-15",
        heure_depart: "08:30",
        climatisation: "climatise",
        escorte: "avec_escorte",
        montant: 15000,
        statut: "valide",
        signature_qr: "mock-sig-1",
        cree_par: "comm-uuid-1111-2222",
        cree_par_nom: "Moussa Ndiaye",
        envoye: true,
        envoye_le: "2026-07-02T10:00:00.000Z",
        envoye_par: "comm-uuid-1111-2222",
        created_at: "2026-07-02T09:00:00.000Z"
      }
    ],
    compteur_billets: { 2026: 482 },
    lockouts: {}
  };

  writeDB(defaultDB);
  return defaultDB;
}

function writeDB(db) {
  if (fsModule) {
    try {
      fsModule.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.error("Erreur d'écriture dans la base mock locale", e);
    }
  }
}

// --- UTILITAIRES CRYPTOGRAPHIQUES (WEB CRYPTO API) ---
async function generateHMAC(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    messageData
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- SECURE AUTHENTICATION CHECK ---
async function getAuthenticatedUser(request, isSupabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, localDB) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];

  if (isSupabase) {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${token}`
      }
    });
    if (!verifyRes.ok) return null;
    return await verifyRes.json();
  } else {
    const user = localDB.profiles.find(p => p.id === token);
    if (!user || !user.actif) return null;
    return user;
  }
}

async function getUserProfile(userId, isSupabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, localDB) {
  if (!userId) return null;
  if (isSupabase) {
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!profileRes.ok) return null;
    const profiles = await profileRes.json();
    return profiles[0] || null;
  } else {
    return localDB.profiles.find(p => p.id === userId) || null;
  }
}

export default {
  async fetch(request, rawEnv, ctx) {
    const env = { ...rawEnv };
    if (env.SUPABASE_URL) {
      env.SUPABASE_URL = env.SUPABASE_URL.trim().replace(/\/$/, "");
    }
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Détecter si on doit utiliser Supabase en production, ou simuler localement
      const isSupabase = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
      const HMAC_SECRET = env.HMAC_SECRET || "some-extremely-secure-key-1234567890-abcdef";
      // SUPABASE_ANON_KEY est requis pour l'auth utilisateur (password grant)
      // Si non fourni, on utilise SERVICE_ROLE_KEY (peut causer des erreurs sur certains projets)
      const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      const localDB = isSupabase ? null : readDB();

      // ==========================================
      // ROUTE: HEALTH CHECK (DIAGNOSTIC)
      // ==========================================
      if (path === "/api/health" && method === "GET") {
        return new Response(JSON.stringify({
          status: "ok",
          mode: isSupabase ? "supabase" : "mock_local",
          supabase_url_set: !!env.SUPABASE_URL,
          supabase_url_preview: env.SUPABASE_URL ? env.SUPABASE_URL.substring(0, 30) + '...' : null,
          supabase_service_key_set: !!env.SUPABASE_SERVICE_ROLE_KEY,
          supabase_anon_key_set: !!env.SUPABASE_ANON_KEY,
          hmac_secret_set: !!env.HMAC_SECRET,
          timestamp: new Date().toISOString()
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ==========================================
      // ROUTE: DEBUG AUTH (TEST SUPABASE CONNECTION)
      // ==========================================
      if (path === "/api/debug-auth" && method === "GET") {
        if (!isSupabase) {
          return new Response(JSON.stringify({ mode: "mock_local", message: "Supabase non configuré - variables manquantes", supabase_url_set: !!env.SUPABASE_URL, service_role_key_set: !!env.SUPABASE_SERVICE_ROLE_KEY }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Tester la connexion Supabase en appelant l'endpoint de health
        try {
          const testRes = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          });
          // Tester si la table profiles existe
          const profilesRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?limit=1`, {
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          });
          const profilesData = await profilesRes.json();
          return new Response(JSON.stringify({
            mode: "supabase",
            supabase_reachable: testRes.ok || testRes.status === 200,
            supabase_status: testRes.status,
            profiles_table_exists: profilesRes.ok,
            profiles_count: Array.isArray(profilesData) ? profilesData.length : 0,
            profiles_error: !profilesRes.ok ? profilesData : null,
            anon_key_used: !!env.SUPABASE_ANON_KEY ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY (fallback)'
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch(e) {
          return new Response(JSON.stringify({ mode: "supabase", error: e.message, supabase_url: env.SUPABASE_URL?.substring(0, 30) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ==========================================
      // ROUTE: LOGIN
      // ==========================================
      if (path === "/api/auth/login" && method === "POST") {
        const body = await request.json();
        const { email, password } = body;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Veuillez fournir un email et un mot de passe." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (isSupabase) {
          const loginRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              "apikey": SUPABASE_ANON_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
          });
          if (!loginRes.ok) {
            const errData = await loginRes.json();
            // Débogage détaillé de l'erreur Supabase
            const errMsg = errData.error_description || errData.error || errData.msg || errData.message || "Identifiants de connexion invalides.";
            const debugInfo = {
              error: errMsg,
              supabase_status: loginRes.status,
              supabase_raw: errData
            };
            return new Response(JSON.stringify(debugInfo), { status: loginRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const loginData = await loginRes.json();
          const userId = loginData.user.id;

          const profileRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          });
          const profiles = await profileRes.json();
          const profile = profiles[0];

          if (profile && !profile.actif) {
            return new Response(JSON.stringify({ error: "Votre compte est inactif. Contactez l'administrateur." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          return new Response(JSON.stringify({
            success: true,
            token: loginData.access_token,
            profile: {
              id: userId,
              nom: profile?.nom || loginData.user.user_metadata?.nom || "",
              prenom: profile?.prenom || loginData.user.user_metadata?.prenom || "",
              email: loginData.user.email,
              role: profile?.role || "commercial",
              actif: profile ? profile.actif : true
            }
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const normalizedEmail = email.toLowerCase().trim();
          const lockoutState = localDB.lockouts[normalizedEmail];
          if (lockoutState && lockoutState.lockedUntil) {
            const lockedTime = new Date(lockoutState.lockedUntil).getTime();
            if (lockedTime > Date.now()) {
              const mins = Math.ceil((lockedTime - Date.now()) / 60000);
              return new Response(JSON.stringify({ error: `Compte verrouillé temporairement. Réessayez dans ${mins} minute(s).` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
              delete localDB.lockouts[normalizedEmail];
              writeDB(localDB);
            }
          }

          const user = localDB.profiles.find(p => p.email.toLowerCase().trim() === normalizedEmail);
          const providedHash = await sha256(password);

          if (!user || user.passwordHash !== providedHash) {
            const currentAttempts = (lockoutState?.attempts || 0) + 1;
            if (currentAttempts >= 5) {
              const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
              localDB.lockouts[normalizedEmail] = { attempts: currentAttempts, lockedUntil };
              writeDB(localDB);
              return new Response(JSON.stringify({ error: "Compte verrouillé temporairement pour 15 minutes suite à 5 tentatives échouées." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
              localDB.lockouts[normalizedEmail] = { attempts: currentAttempts };
              writeDB(localDB);
              return new Response(JSON.stringify({ error: `Identifiants incorrects. Tentatives restantes : ${5 - currentAttempts}.` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          if (!user.actif) {
            return new Response(JSON.stringify({ error: "Votre compte est inactif. Contactez l'administrateur." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          delete localDB.lockouts[normalizedEmail];
          writeDB(localDB);

          return new Response(JSON.stringify({
            success: true,
            token: user.id,
            profile: {
              id: user.id,
              nom: user.nom,
              prenom: user.prenom,
              email: user.email,
              role: user.role,
              actif: user.actif
            }
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // --- MIDDLEWARE D'AUTHENTIFICATION ---
      const authUser = await getAuthenticatedUser(request, isSupabase, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, localDB);
      if (!authUser) {
        // Ignorer l'auth pour le téléchargement direct public du billet
        const matchTelecharger = path.match(/^\/billet\/telecharger\/([^/]+)$/);
        if (!matchTelecharger) {
          return new Response(JSON.stringify({ error: "Session expirée ou invalide. Reconnectez-vous." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const activeProfile = isSupabase ? await getUserProfile(authUser?.id || authUser?.user?.id, true, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, null) : authUser;

      // ==========================================
      // ROUTE: CHANGE PASSWORD (ADMIN)
      // ==========================================
      if (path === "/api/auth/change-password" && method === "POST") {
        if (activeProfile.role !== "admin") {
          return new Response(JSON.stringify({ error: "Seul l'administrateur peut effectuer cette opération." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { newPassword } = await request.json();
        if (!newPassword || newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 6 caractères." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (isSupabase) {
          const resetRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${activeProfile.id}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ password: newPassword })
          });
          if (!resetRes.ok) {
            return new Response(JSON.stringify({ error: "Échec du changement de mot de passe sur Supabase" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } else {
          const idx = localDB.profiles.findIndex(p => p.id === activeProfile.id);
          if (idx !== -1) {
            localDB.profiles[idx].passwordHash = await sha256(newPassword);
            writeDB(localDB);
          }
        }
        return new Response(JSON.stringify({ success: true, message: "Mot de passe modifié avec succès." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ==========================================
      // ROUTE: TARIFS (GET, POST)
      // ==========================================
      if (path === "/api/tarifs") {
        if (method === "GET") {
          if (isSupabase) {
            const tarifsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tarifs?order=id.asc`, {
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
              }
            });
            const tarifs = await tarifsRes.json();
            return new Response(JSON.stringify(tarifs), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else {
            return new Response(JSON.stringify(localDB.tarifs), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        if (method === "POST") {
          if (activeProfile.role !== "admin") {
            return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const newTarifs = await request.json();
          if (!Array.isArray(newTarifs) || newTarifs.length !== 4) {
            return new Response(JSON.stringify({ error: "Données tarifaires incorrectes" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const cleanTarifs = newTarifs.map(t => ({
            id: t.id,
            climatisation: t.climatisation,
            escorte: t.escorte,
            prix: Number(t.prix) || 0,
            actif: true
          }));

          if (isSupabase) {
            const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tarifs`, {
              method: "POST",
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
              },
              body: JSON.stringify(cleanTarifs)
            });
            if (!upsertRes.ok) {
              return new Response(JSON.stringify({ error: "Impossible de sauvegarder les tarifs sur Supabase" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          } else {
            localDB.tarifs = cleanTarifs;
            writeDB(localDB);
          }
          return new Response(JSON.stringify({ success: true, tarifs: cleanTarifs }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ==========================================
      // ROUTE: ADMIN PROFILES (GET, POST)
      // ==========================================
      if (path === "/api/admin/profiles") {
        if (activeProfile.role !== "admin") {
          return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (method === "GET") {
          if (isSupabase) {
            const profsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?order=created_at.desc`, {
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
              }
            });
            const profiles = await profsRes.json();
            return new Response(JSON.stringify(profiles), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else {
            const cleanProfs = localDB.profiles.map(p => ({
              id: p.id,
              nom: p.nom,
              prenom: p.prenom,
              email: p.email,
              role: p.role,
              actif: p.actif,
              created_at: p.created_at
            }));
            return new Response(JSON.stringify(cleanProfs), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        if (method === "POST") {
          const body = await request.json();
          const { action, nom, prenom, email, password, profileId, actif } = body;

          if (action === "create") {
            if (!nom || !prenom || !email || !password) {
              return new Response(JSON.stringify({ error: "Tous les champs sont requis." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            if (isSupabase) {
              const signupRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  email,
                  password,
                  email_confirm: true,
                  user_metadata: { nom, prenom, role: "commercial" }
                })
              });
              if (!signupRes.ok) {
                const err = await signupRes.json();
                return new Response(JSON.stringify({ error: "Création échouée", details: err }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
              const createdUser = await signupRes.json();
              const userId = createdUser.user.id;

              await fetch(`${env.SUPABASE_URL}/rest/v1/profiles`, {
                method: "POST",
                headers: {
                  "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  id: userId,
                  nom,
                  prenom,
                  email,
                  role: "commercial",
                  actif: true
                })
              });
              return new Response(JSON.stringify({ success: true, profile: { id: userId, nom, prenom, email, role: 'commercial', actif: true } }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
              if (localDB.profiles.some(p => p.email.toLowerCase() === email.toLowerCase())) {
                return new Response(JSON.stringify({ error: "Cet email est déjà utilisé." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
              const newProfile = {
                id: "comm-uuid-" + crypto.randomUUID().slice(0, 8),
                nom,
                prenom,
                email: email.toLowerCase().trim(),
                role: 'commercial',
                actif: true,
                passwordHash: await sha256(password),
                created_at: new Date().toISOString()
              };
              localDB.profiles.push(newProfile);
              writeDB(localDB);
              return new Response(JSON.stringify({ success: true, profile: { id: newProfile.id, nom, prenom, email, role: 'commercial', actif: true } }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          if (action === "toggle_status") {
            if (isSupabase) {
              const statusRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`, {
                method: "PATCH",
                headers: {
                  "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ actif })
              });
              if (!statusRes.ok) {
                return new Response(JSON.stringify({ error: "Échec" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
              // Bannir si inactif
              await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${profileId}`, {
                method: "PUT",
                headers: {
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ ban_duration: actif ? "none" : "876000h" })
              });
            } else {
              const idx = localDB.profiles.findIndex(p => p.id === profileId);
              if (idx === -1) return new Response(JSON.stringify({ error: "Profil non trouvé" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              if (localDB.profiles[idx].role === 'admin') return new Response(JSON.stringify({ error: "Impossible de désactiver l'administrateur." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              localDB.profiles[idx].actif = actif;
              writeDB(localDB);
            }
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (action === "reset_password") {
            if (!password || password.length < 6) return new Response(JSON.stringify({ error: "Mot de passe trop court" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            if (isSupabase) {
              const resetRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${profileId}`, {
                method: "PUT",
                headers: {
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ password })
              });
              if (!resetRes.ok) return new Response(JSON.stringify({ error: "Échec" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
              const idx = localDB.profiles.findIndex(p => p.id === profileId);
              if (idx === -1) return new Response(JSON.stringify({ error: "Profil non trouvé" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              localDB.profiles[idx].passwordHash = await sha256(password);
              writeDB(localDB);
            }
            return new Response(JSON.stringify({ success: true, message: "Mot de passe modifié" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ==========================================
      // ROUTE: BILLETS (GET, POST)
      // ==========================================
      if (path === "/api/billets") {
        if (method === "GET") {
          if (isSupabase) {
            let query = `${env.SUPABASE_URL}/rest/v1/billets?order=created_at.desc`;
            if (activeProfile.role !== "admin") {
              query += `&cree_par=eq.${activeProfile.id}`;
            }
            const res = await fetch(query, {
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
              }
            });
            const billets = await res.json();
            return new Response(JSON.stringify(billets), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else {
            if (activeProfile.role === "admin") {
              return new Response(JSON.stringify(localDB.billets), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
              const filtered = localDB.billets.filter(b => b.cree_par === activeProfile.id);
              return new Response(JSON.stringify(filtered), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }
        }

        if (method === "POST") {
          const body = await request.json();
          const { nom_passager, prenom_passager, telephone, date_depart, heure_depart, climatisation, escorte } = body;

          if (!nom_passager?.trim() || !prenom_passager?.trim()) {
            return new Response(JSON.stringify({ error: "Nom et prénom obligatoires" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          if (!/^7[0-9]{8}$/.test(telephone)) {
            return new Response(JSON.stringify({ error: "Numéro de téléphone sénégalais invalide (ex: 771234567)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const anneeEnCours = new Date(date_depart).getFullYear();
          const timestamp = new Date().toISOString();

          let montant = 0;
          let numeroBillet = "";
          let signature_qr = "";
          let billetCree = null;

          if (isSupabase) {
            // Trouver le prix en base
            const prixRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tarifs?climatisation=eq.${climatisation}&escorte=eq.${escorte}&actif=eq.true`, {
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
              }
            });
            const tarifs = await prixRes.json();
            if (!tarifs || tarifs.length === 0) {
              return new Response(JSON.stringify({ error: "Tarif introuvable pour cette configuration" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            montant = tarifs[0].prix;

            // Incrémentation du compteur de billets
            let dernierNumero = null;
            const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/incrementer_compteur`, {
              method: "POST",
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ p_annee: anneeEnCours })
            });

            if (rpcRes.ok) {
              dernierNumero = await rpcRes.json();
            } else {
              // Fallback: compter les billets existants de cette année
              const countRes = await fetch(`${env.SUPABASE_URL}/rest/v1/billets?select=id&date_depart=gte.${anneeEnCours}-01-01&date_depart=lte.${anneeEnCours}-12-31`, {
                headers: {
                  "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                }
              });
              const countData = await countRes.json();
              dernierNumero = (countData?.length || 0) + 1;
            }

            numeroBillet = `IMD-${anneeEnCours}-${String(dernierNumero).padStart(6, '0')}`;
            signature_qr = await generateHMAC(`${numeroBillet}|${timestamp}`, HMAC_SECRET);

            const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/billets`, {
              method: "POST",
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
              },
              body: JSON.stringify({
                numero_billet: numeroBillet,
                nom_passager: nom_passager.trim(),
                prenom_passager: prenom_passager.trim(),
                telephone,
                date_depart,
                heure_depart,
                climatisation,
                escorte,
                montant,
                statut: 'valide',
                signature_qr,
                cree_par: activeProfile.id,
                cree_par_nom: `${activeProfile.prenom} ${activeProfile.nom}`,
                envoye: false,
                created_at: timestamp
              })
            });

            if (!insertRes.ok) {
              const err = await insertRes.text();
              return new Response(JSON.stringify({ error: "Échec de l'enregistrement", details: err }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const insData = await insertRes.json();
            billetCree = insData[0];
          } else {
            const tarif = localDB.tarifs.find(t => t.climatisation === climatisation && t.escorte === escorte && t.actif);
            if (!tarif) {
              return new Response(JSON.stringify({ error: "Tarif introuvable pour cette configuration" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            montant = tarif.prix;

            const dernierNumero = (localDB.compteur_billets[anneeEnCours] || 0) + 1;
            localDB.compteur_billets[anneeEnCours] = dernierNumero;

            numeroBillet = `IMD-${anneeEnCours}-${String(dernierNumero).padStart(6, '0')}`;
            signature_qr = await generateHMAC(`${numeroBillet}|${timestamp}`, HMAC_SECRET);

            billetCree = {
              id: "billet-uuid-" + crypto.randomUUID().slice(0, 8),
              numero_billet: numeroBillet,
              nom_passager: nom_passager.trim(),
              prenom_passager: prenom_passager.trim(),
              telephone,
              date_depart,
              heure_depart,
              climatisation,
              escorte,
              montant,
              statut: "valide",
              signature_qr,
              cree_par: activeProfile.id,
              cree_par_nom: `${activeProfile.prenom} ${activeProfile.nom}`,
              envoye: false,
              created_at: timestamp
            };

            localDB.billets.unshift(billetCree);
            writeDB(localDB);
          }

          // Confectionner le payload du QR Code
          const qrPayload = {
            num: numeroBillet,
            nom: nom_passager.trim(),
            prenom: prenom_passager.trim(),
            date: date_depart,
            heure: heure_depart,
            clim: climatisation,
            esc: escorte,
            montant,
            ts: timestamp
          };

          const payloadStr = JSON.stringify(qrPayload);
          // Encodage base64 standard de manière sûre avec caractères accentués
          const base64Payload = btoa(encodeURIComponent(payloadStr).replace(/%([0-9A-F]{2})/g, (_, p1) => {
            return String.fromCharCode(parseInt(p1, 16));
          }));
          const qrCodeString = `${base64Payload}.${signature_qr}`;

          return new Response(JSON.stringify({
            success: true,
            billet: billetCree,
            qrCodeString
          }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ==========================================
      // ROUTE: SCAN BILLETS
      // ==========================================
      if (path === "/api/billets/scan" && method === "POST") {
        const body = await request.json();
        const { qrCodeString } = body;

        if (!qrCodeString || !qrCodeString.includes('.')) {
          return new Response(JSON.stringify({ error: "Format du QR Code incorrect ou illisible." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const [base64Payload, signatureRecue] = qrCodeString.split('.');
        let payload = null;
        try {
          payload = JSON.parse(decodeURIComponent(atob(base64Payload).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join('')));
        } catch (e) {
          return new Response(JSON.stringify({ error: "QR Code non décodable." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { num, ts } = payload;
        if (!num || !ts) {
          return new Response(JSON.stringify({ error: "Contenu du QR Code corrompu." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const expectedHMAC = await generateHMAC(`${num}|${ts}`, HMAC_SECRET);
        if (expectedHMAC !== signatureRecue) {
          return new Response(JSON.stringify({ error: "Signature de sécurité non reconnue ! Tentative de fraude détectée" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (isSupabase) {
          const billetRes = await fetch(`${env.SUPABASE_URL}/rest/v1/billets?numero_billet=eq.${num}`, {
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          });
          const billets = await billetRes.json();
          if (!billets || billets.length === 0) {
            return new Response(JSON.stringify({ error: "Billet inexistant dans notre système." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const billet = billets[0];

          if (billet.statut === "utilise") {
            const scanneurRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${billet.scanne_par}`, {
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
              }
            });
            const scanneurs = await scanneurRes.json();
            const scanneurNom = scanneurs[0] ? `${scanneurs[0].prenom} ${scanneurs[0].nom}` : "Inconnu";

            return new Response(JSON.stringify({
              status: "deja_utilise",
              error: "Billet DÉJÀ UTILISÉ !",
              scanne_le: billet.scanne_le,
              scanne_par_nom: scanneurNom,
              billet
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (billet.statut === "annule") {
            return new Response(JSON.stringify({
              status: "annule",
              error: "Billet ANNULÉ !",
              annule_le: billet.annule_le,
              billet
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Valide -> Changer en "utilise"
          const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/billets?id=eq.${billet.id}`, {
            method: "PATCH",
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({
              statut: "utilise",
              scanne_par: activeProfile.id,
              scanne_le: new Date().toISOString()
            })
          });
          const updatedBillets = await updateRes.json();
          return new Response(JSON.stringify({
            success: true,
            status: "valide",
            message: "Embarquement autorisé !",
            billet: updatedBillets[0]
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const bIndex = localDB.billets.findIndex(b => b.numero_billet === num);
          if (bIndex === -1) {
            return new Response(JSON.stringify({ error: "Billet inexistant dans notre système." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const billet = localDB.billets[bIndex];

          if (billet.statut === "utilise") {
            const scanneur = localDB.profiles.find(p => p.id === billet.scanne_par);
            const scanneurNom = scanneur ? `${scanneur.prenom} ${scanneur.nom}` : "Inconnu";
            return new Response(JSON.stringify({
              status: "deja_utilise",
              error: "Billet DÉJÀ UTILISÉ !",
              scanne_le: billet.scanne_le,
              scanne_par_nom: scanneurNom,
              billet
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (billet.statut === "annule") {
            return new Response(JSON.stringify({
              status: "annule",
              error: "Billet ANNULÉ !",
              annule_le: billet.annule_le,
              billet
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          localDB.billets[bIndex].statut = "utilise";
          localDB.billets[bIndex].scanne_par = activeProfile.id;
          localDB.billets[bIndex].scanne_le = new Date().toISOString();
          writeDB(localDB);

          return new Response(JSON.stringify({
            success: true,
            status: "valide",
            message: "Embarquement autorisé !",
            billet: localDB.billets[bIndex]
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ==========================================
      // ROUTE: ANNULER BILLETS
      // ==========================================
      if (path === "/api/billets/annuler" && method === "POST") {
        if (activeProfile.role !== "admin") {
          return new Response(JSON.stringify({ error: "Action réservée aux administrateurs." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { id } = await request.json();

        if (isSupabase) {
          const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/billets?id=eq.${id}`, {
            method: "PATCH",
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({
              statut: "annule",
              annule_par: activeProfile.id,
              annule_le: new Date().toISOString()
            })
          });
          if (!updateRes.ok) {
            return new Response(JSON.stringify({ error: "Impossible d'annuler" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const upData = await updateRes.json();
          return new Response(JSON.stringify({ success: true, billet: upData[0] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const idx = localDB.billets.findIndex(b => b.id === id);
          if (idx === -1) {
            return new Response(JSON.stringify({ error: "Billet introuvable." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          localDB.billets[idx].statut = 'annule';
          localDB.billets[idx].annule_par = activeProfile.id;
          localDB.billets[idx].annule_le = new Date().toISOString();
          writeDB(localDB);
          return new Response(JSON.stringify({ success: true, billet: localDB.billets[idx] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ==========================================
      // ROUTE: ENVOYER BILLETS
      // ==========================================
      if (path === "/api/billets/envoyer" && method === "POST") {
        const { id } = await request.json();
        let billet = null;

        if (isSupabase) {
          const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/billets?id=eq.${id}`, {
            method: "PATCH",
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({
              envoye: true,
              envoye_le: new Date().toISOString(),
              envoye_par: activeProfile.id
            })
          });
          if (!updateRes.ok) {
            return new Response(JSON.stringify({ error: "Billet introuvable." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const upData = await updateRes.json();
          billet = upData[0];
        } else {
          const idx = localDB.billets.findIndex(b => b.id === id);
          if (idx === -1) {
            return new Response(JSON.stringify({ error: "Billet introuvable." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          localDB.billets[idx].envoye = true;
          localDB.billets[idx].envoye_le = new Date().toISOString();
          localDB.billets[idx].envoye_par = activeProfile.id;
          writeDB(localDB);
          billet = localDB.billets[idx];
        }

        const signedUrl = `${url.origin}/billet/telecharger/${id}`;

        return new Response(JSON.stringify({
          success: true,
          signedUrl,
          billet
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ==========================================
      // ROUTE: RENDER BILLET IMPRIMABLE (PUBLIC)
      // ==========================================
      const matchTelecharger = path.match(/^\/billet\/telecharger\/([^/]+)$/);
      if (matchTelecharger && method === "GET") {
        const id = matchTelecharger[1];
        let billet = null;

        if (isSupabase) {
          const res = await fetch(`${env.SUPABASE_URL}/rest/v1/billets?id=eq.${id}`, {
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          });
          const billets = await res.json();
          billet = billets?.[0] || null;
        } else {
          billet = localDB.billets.find(b => b.id === id) || null;
        }

        if (!billet) {
          return new Response("<h1>Billet introuvable ou expiré</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }

        const optionsText = `${billet.climatisation === 'climatise' ? 'Climatisé' : 'Non-Climatisé'} / ${billet.escorte === 'avec_escorte' ? 'Avec Escorte' : 'Sans Escorte'}`;

        // Construction du payload du QR code à lire par le scanner
        const qrPayload = {
          num: billet.numero_billet,
          nom: billet.nom_passager,
          prenom: billet.prenom_passager,
          date: billet.date_depart,
          heure: billet.heure_depart,
          clim: billet.climatisation,
          esc: billet.escorte,
          montant: billet.montant,
          ts: billet.created_at
        };
        const payloadStr = JSON.stringify(qrPayload);
        const base64Payload = btoa(encodeURIComponent(payloadStr).replace(/%([0-9A-F]{2})/g, (_, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        }));
        const qrCodeString = `${base64Payload}.${billet.signature_qr}`;

        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Billet IMMO DAKAR - ${billet.numero_billet}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; padding: 40px; margin: 0; color: #111827; }
    .ticket-card { max-width: 600px; margin: 0 auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
    .ticket-header { background-color: #0f172a; color: white; padding: 24px; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 24px; font-weight: bold; font-style: italic; }
    .ticket-body { padding: 32px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px dashed #f3f4f6; padding-bottom: 12px; }
    .label { color: #6b7280; font-size: 13px; text-transform: uppercase; font-weight: 600; }
    .value { font-weight: bold; font-size: 16px; }
    .qr-section { text-align: center; margin-top: 32px; padding: 20px; background-color: #fafafa; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .qr-placeholder { font-size: 11px; color: #9ca3af; margin-top: 8px; font-family: monospace; }
    .footer { text-align: center; font-size: 11px; color: #9ca3af; padding: 20px; border-top: 1px solid #f3f4f6; }
    .print-btn { display: block; width: 100%; max-width: 200px; margin: 20px auto; padding: 10px; background: #0f172a; color: white; text-align: center; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
    #qr-canvas { border: 1px solid #e5e7eb; padding: 4px; background: white; border-radius: 6px; width: 180px; height: 180px; }
    @media print {
      .print-btn { display: none; }
      body { background: white; padding: 0; }
      .ticket-card { border: none; box-shadow: none; max-width: 100%; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js"></script>
</head>
<body>
  <div class="ticket-card">
    <div class="ticket-header">
      <div>
        <span class="logo">IMD</span>
        <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">IMMO DAKAR TRANSPORT</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; opacity: 0.8;">Billet officiel</div>
        <div style="font-size: 18px; font-weight: bold; font-family: monospace; margin-top: 4px;">${billet.numero_billet}</div>
      </div>
    </div>
    <div class="ticket-body">
      <div class="row">
        <div>
          <div class="label">Passager</div>
          <div class="value">${billet.prenom_passager} ${billet.nom_passager}</div>
        </div>
        <div style="text-align: right;">
          <div class="label">Téléphone</div>
          <div class="value">+221 ${billet.telephone}</div>
        </div>
      </div>

      <div class="row">
        <div>
          <div class="label">Date de départ</div>
          <div class="value">${new Date(billet.date_depart).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div style="text-align: right;">
          <div class="label">Heure</div>
          <div class="value">${billet.heure_depart}</div>
        </div>
      </div>

      <div class="row">
        <div>
          <div class="label">Options</div>
          <div class="value">${optionsText}</div>
        </div>
        <div style="text-align: right;">
          <div class="label">Montant payé</div>
          <div class="value" style="font-size: 20px; color: #10b981;">${billet.montant.toLocaleString('fr-FR')} FCFA</div>
        </div>
      </div>

      <div class="qr-section">
        <canvas id="qr-canvas"></canvas>
        <div class="qr-placeholder">Signature de sécurité HMAC active</div>
      </div>
    </div>
    <div class="footer">
      © 2026 IMMO DAKAR SERVICES - Document officiel cryptographique infalsifiable.
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">Imprimer le billet</button>

  <script>
    QRCode.toCanvas(document.getElementById('qr-canvas'), "${qrCodeString}", {
      width: 180,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    }, function (error) {
      if (error) console.error("Erreur de rendu QR Code", error);
    });
  </script>
</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      // Route par défaut non trouvée
      return new Response(JSON.stringify({ error: "Non trouvé" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
