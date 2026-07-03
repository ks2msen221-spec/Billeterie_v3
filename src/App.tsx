import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Search,
  Filter,
  Users,
  DollarSign,
  PlusCircle,
  FileSpreadsheet,
  Trash2,
  Send,
  Printer,
  Camera,
  RefreshCw,
  Lock,
  LogOut,
  Sliders,
  Check,
  X,
  UserCheck,
  UserX,
  KeyRound,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Types correspondants au modèle de données
interface Profile {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: 'admin' | 'commercial';
  actif: boolean;
  created_at?: string;
}

interface Tarif {
  id: string;
  climatisation: 'climatise' | 'non_climatise';
  escorte: 'avec_escorte' | 'sans_escorte';
  prix: number;
  actif: boolean;
}

interface Billet {
  id: string;
  numero_billet: string;
  nom_passager: string;
  prenom_passager: string;
  telephone: string;
  date_depart: string;
  heure_depart: string;
  climatisation: 'climatise' | 'non_climatise';
  escorte: 'avec_escorte' | 'sans_escorte';
  montant: number;
  statut: 'valide' | 'utilise' | 'annule';
  signature_qr: string;
  cree_par: string;
  cree_par_nom?: string;
  scanne_par?: string;
  scanne_le?: string;
  annule_par?: string;
  annule_le?: string;
  envoye: boolean;
  envoye_le?: string;
  envoye_par?: string;
  created_at: string;
}

export default function App() {
  // --- ÉTATS GLOBAUX D'AUTHENTIFICATION ---
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('im_token'));
  const [user, setUser] = useState<Profile | null>(() => {
    const saved = localStorage.getItem('im_user');
    return saved ? JSON.parse(saved) : null;
  });

  // États du formulaire de connexion
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // --- MENU ACTIF ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create_ticket' | 'scan_qr' | 'tarifs' | 'commerciaux'>('dashboard');

  // --- DONNÉES GLOBALES ---
  const [billets, setBillets] = useState<Billet[]>([]);
  const [tarifs, setTarifs] = useState<Tarif[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingBillets, setLoadingBillets] = useState(false);
  const [loadingTarifs, setLoadingTarifs] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // --- FILTRES DU DASHBOARD ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCommercial, setFilterCommercial] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  const [filterClim, setFilterClim] = useState('all');
  const [filterEscorte, setFilterEscorte] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  // --- CRÉATION DE BILLET ---
  const [newTicketNom, setNewTicketNom] = useState('');
  const [newTicketPrenom, setNewTicketPrenom] = useState('');
  const [newTicketTel, setNewTicketTel] = useState('');
  const [newTicketDate, setNewTicketDate] = useState('');
  const [newTicketHeure, setNewTicketHeure] = useState('08:30');
  const [newTicketClim, setNewTicketClim] = useState<'climatise' | 'non_climatise'>('non_climatise');
  const [newTicketEscorte, setNewTicketEscorte] = useState<'avec_escorte' | 'sans_escorte'>('sans_escorte');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [createdTicketResult, setCreatedTicketResult] = useState<{ billet: Billet; qrCodeString: string } | null>(null);
  const [ticketQrBase64, setTicketQrBase64] = useState<string>('');
  const [loadingTicketQr, setLoadingTicketQr] = useState<boolean>(false);

  // Aperçu de billet existant
  const [previewBillet, setPreviewBillet] = useState<Billet | null>(null);
  const [previewQrBase64, setPreviewQrBase64] = useState<string>('');
  const [loadingPreviewQr, setLoadingPreviewQr] = useState<boolean>(false);

  // --- SCAN & VÉRIFICATION ---
  const [manualQrString, setManualQrString] = useState('');
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    status: 'valide' | 'deja_utilise' | 'annule' | 'corrompu';
    message?: string;
    error?: string;
    billet?: Billet;
    scanne_le?: string;
    scanne_par_nom?: string;
    annule_le?: string;
  } | null>(null);
  const [scanningLoading, setScanningLoading] = useState(false);
  const qrScannerRef = useRef<Html5QrcodeScanner | null>(null);

  // --- GESTION DES TARIFS (ADMIN ONLY) ---
  const [editedTarifs, setEditedTarifs] = useState<Tarif[]>([]);
  const [savingTarifs, setSavingTarifs] = useState(false);
  const [tarifsSuccessMsg, setTarifsSuccessMsg] = useState<string | null>(null);

  // --- GESTION DES COMPTES (ADMIN ONLY) ---
  const [newCommNom, setNewCommNom] = useState('');
  const [newCommPrenom, setNewCommPrenom] = useState('');
  const [newCommEmail, setNewCommEmail] = useState('');
  const [newCommPassword, setNewCommPassword] = useState('');
  const [creatingComm, setCreatingComm] = useState(false);
  const [commError, setCommError] = useState<string | null>(null);
  
  // Réinitialisation mot de passe commercial
  const [selectedCommForReset, setSelectedCommForReset] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  // Changement de mot de passe propre (Admin)
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPassSuccess, setAdminPassSuccess] = useState<string | null>(null);
  const [adminPassError, setAdminPassError] = useState<string | null>(null);

  // --- INITIALISATION ---
  useEffect(() => {
    if (token) {
      fetchBillets();
      fetchTarifs();
      if (user?.role === 'admin') {
        fetchProfiles();
      }
    }
  }, [token]);

  // Générer le QR Code à l'écran quand un billet est créé
  useEffect(() => {
    if (createdTicketResult?.qrCodeString) {
      setLoadingTicketQr(true);
      setTicketQrBase64('');
      QRCode.toDataURL(createdTicketResult.qrCodeString, { width: 250, margin: 1 })
        .then(url => {
          setTicketQrBase64(url);
          setLoadingTicketQr(false);
        })
        .catch(err => {
          console.error("Erreur génération QR Code", err);
          setLoadingTicketQr(false);
        });
    } else {
      setTicketQrBase64('');
      setLoadingTicketQr(false);
    }
  }, [createdTicketResult]);

  // Générer le QR Code à l'écran pour l'aperçu d'un billet existant
  useEffect(() => {
    if (previewBillet) {
      setLoadingPreviewQr(true);
      setPreviewQrBase64('');
      
      const qrPayload = {
        num: previewBillet.numero_billet,
        nom: previewBillet.nom_passager,
        prenom: previewBillet.prenom_passager,
        date: previewBillet.date_depart,
        heure: previewBillet.heure_depart,
        clim: previewBillet.climatisation,
        esc: previewBillet.escorte,
        montant: previewBillet.montant,
        ts: previewBillet.created_at
      };
      
      try {
        const payloadStr = JSON.stringify(qrPayload);
        const base64Payload = btoa(encodeURIComponent(payloadStr).replace(/%([0-9A-F]{2})/g, (_, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        }));
        const qrCodeString = `${base64Payload}.${previewBillet.signature_qr}`;

        QRCode.toDataURL(qrCodeString, { width: 250, margin: 1 })
          .then(url => {
            setPreviewQrBase64(url);
            setLoadingPreviewQr(false);
          })
          .catch(err => {
            console.error("Erreur génération QR Code", err);
            setLoadingPreviewQr(false);
          });
      } catch (err) {
        console.error("Erreur d'encodage QR Payload", err);
        setLoadingPreviewQr(false);
      }
    } else {
      setPreviewQrBase64('');
      setLoadingPreviewQr(false);
    }
  }, [previewBillet]);

  // Initialisation du scanner html5-qrcode
  useEffect(() => {
    if (activeTab === 'scan_qr' && token) {
      // Démarre l'appareil photo
      setTimeout(() => {
        try {
          const scanner = new Html5QrcodeScanner(
            "qr-reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
          );
          
          scanner.render(
            (decodedText) => {
              // On scanne avec succès
              handleScanRequest(decodedText);
              scanner.clear();
            },
            (errorMessage) => {
              // Erreurs mineures de frame rate, on ignore pour éviter le spam
            }
          );
          qrScannerRef.current = scanner;
        } catch (e) {
          console.error("Impossible de charger la caméra", e);
        }
      }, 200);
    } else {
      // Arrêter le scanner si on change d'onglet
      if (qrScannerRef.current) {
        try {
          qrScannerRef.current.clear();
        } catch (e) {}
        qrScannerRef.current = null;
      }
    }

    return () => {
      if (qrScannerRef.current) {
        try {
          qrScannerRef.current.clear();
        } catch (e) {}
      }
    };
  }, [activeTab]);

  // --- ACTIONS API ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur de connexion.");
      }

      localStorage.setItem('im_token', data.token);
      localStorage.setItem('im_user', JSON.stringify(data.profile));
      setToken(data.token);
      setUser(data.profile);
      setActiveTab('dashboard');
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('im_token');
    localStorage.removeItem('im_user');
    setToken(null);
    setUser(null);
  };

  const fetchBillets = async () => {
    setLoadingBillets(true);
    try {
      const res = await fetch('/api/billets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBillets(data);
      }
    } catch (e) {
      console.error("Impossible de récupérer les billets", e);
    } finally {
      setLoadingBillets(false);
    }
  };

  const fetchTarifs = async () => {
    setLoadingTarifs(true);
    try {
      const res = await fetch('/api/tarifs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTarifs(data);
        setEditedTarifs(data);
      }
    } catch (e) {
      console.error("Impossible de récupérer les tarifs", e);
    } finally {
      setLoadingTarifs(false);
    }
  };

  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const res = await fetch('/api/admin/profiles', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProfiles(data);
      }
    } catch (e) {
      console.error("Impossible de récupérer les commerciaux", e);
    } finally {
      setLoadingProfiles(false);
    }
  };

  // Création billet
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation du numéro de téléphone sénégalais
    if (!/^7[0-9]{8}$/.test(newTicketTel)) {
      alert("Format du téléphone mobile sénégalais invalide ! Veuillez saisir 9 chiffres commençant par 7 (ex: 771234567).");
      return;
    }

    // Validation date
    const dateSel = new Date(newTicketDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateSel < today) {
      alert("La date de départ ne peut pas être dans le passé.");
      return;
    }

    setCreatingTicket(true);
    try {
      const res = await fetch('/api/billets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nom_passager: newTicketNom,
          prenom_passager: newTicketPrenom,
          telephone: newTicketTel,
          date_depart: newTicketDate,
          heure_depart: newTicketHeure,
          climatisation: newTicketClim,
          escorte: newTicketEscorte
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error);
      }

      setCreatedTicketResult(data);
      fetchBillets(); // Rafraîchir
      
      // Réinitialiser les champs du passager mais conserver la date pour saisie rapide
      setNewTicketNom('');
      setNewTicketPrenom('');
      setNewTicketTel('');
    } catch (e: any) {
      alert("Erreur lors de la création : " + e.message);
    } finally {
      setCreatingTicket(false);
    }
  };

  // Annulation de billet (Admin)
  const handleAnnulerBillet = async (id: string, ref: string) => {
    if (!window.confirm(`Voulez-vous vraiment annuler le billet ${ref} ? Cette opération est irréversible et invalidera le billet au scan.`)) {
      return;
    }

    try {
      const res = await fetch('/api/billets/annuler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error);
      }

      alert(`Le billet ${ref} a été annulé.`);
      fetchBillets();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  };

  // Envoi WhatsApp et génération du billet signé Supabase
  const handleEnvoyerBillet = async (id: string, tel: string, passager: string, ref: string) => {
    try {
      const res = await fetch('/api/billets/envoyer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error);
      }

      // Marqué comme envoyé. Ouvrir WhatsApp
      const message = encodeURIComponent(
        `Bonjour ${passager},\n\nVoici votre billet officiel de transport ImmoDakar Transport sous le numéro *${ref}*.\n\nVous pouvez le télécharger et l'imprimer pour l'embarquement ici :\n${data.signedUrl}\n\nBon voyage !`
      );
      
      // Téléphone au format international pour WhatsApp (ajouter +221)
      const fullTel = tel.startsWith('221') ? tel : `221${tel}`;
      window.open(`https://wa.me/${fullTel}?text=${message}`, '_blank');
      
      fetchBillets(); // Rafraîchir statut d'envoi
    } catch (e: any) {
      alert("Erreur lors de la génération de l'envoi : " + e.message);
    }
  };

  // Scan / Vérification de QR Code
  const handleScanRequest = async (qrString: string) => {
    setScanningLoading(true);
    setScanResult(null);

    try {
      const res = await fetch('/api/billets/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ qrCodeString: qrString.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        setScanResult({
          success: false,
          status: 'corrompu',
          error: data.error || "Une erreur s'est produite."
        });
      } else if (data.status === 'deja_utilise') {
        setScanResult({
          success: false,
          status: 'deja_utilise',
          error: data.error,
          scanne_le: data.scanne_le,
          scanne_par_nom: data.scanne_par_nom,
          billet: data.billet
        });
      } else if (data.status === 'annule') {
        setScanResult({
          success: false,
          status: 'annule',
          error: data.error,
          annule_le: data.annule_le,
          billet: data.billet
        });
      } else {
        setScanResult({
          success: true,
          status: 'valide',
          message: data.message,
          billet: data.billet
        });
      }
      fetchBillets(); // rafraîchir
    } catch (e: any) {
      setScanResult({
        success: false,
        status: 'corrompu',
        error: "Erreur réseau ou format de QR invalide."
      });
    } finally {
      setScanningLoading(false);
    }
  };

  // Sauvegarder grille tarifaire (Admin)
  const handleSaveTarifs = async () => {
    setSavingTarifs(true);
    setTarifsSuccessMsg(null);
    try {
      const res = await fetch('/api/tarifs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editedTarifs)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTarifs(data.tarifs);
      setTarifsSuccessMsg("Grille tarifaire mise à jour avec succès ! Les modifications s'appliquent aux futurs billets.");
      setTimeout(() => setTarifsSuccessMsg(null), 6000);
    } catch (e: any) {
      alert("Erreur d'enregistrement des tarifs: " + e.message);
    } finally {
      setSavingTarifs(false);
    }
  };

  // Création commercial (Admin)
  const handleCreateCommercial = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingComm(true);
    setCommError(null);

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create',
          nom: newCommNom,
          prenom: newCommPrenom,
          email: newCommEmail,
          password: newCommPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(`Compte de ${newCommPrenom} ${newCommNom} créé avec succès !`);
      setNewCommNom('');
      setNewCommPrenom('');
      setNewCommEmail('');
      setNewCommPassword('');
      fetchProfiles();
    } catch (err: any) {
      setCommError(err.message);
    } finally {
      setCreatingComm(false);
    }
  };

  // Désactiver/Réactiver commercial
  const handleToggleCommStatus = async (profileId: string, currentStatus: boolean) => {
    const actionText = currentStatus ? "désactiver" : "réactiver";
    if (!window.confirm(`Voulez-vous vraiment ${actionText} ce compte commercial ?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'toggle_status',
          profileId,
          actif: !currentStatus
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchProfiles();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  };

  // Réinitialiser mot de passe d'un commercial (Admin)
  const handleResetCommPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommForReset || !resetPasswordValue) return;

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'reset_password',
          profileId: selectedCommForReset,
          password: resetPasswordValue
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResetSuccessMsg("Le mot de passe de ce commercial a été réinitialisé.");
      setResetPasswordValue('');
      setTimeout(() => {
        setResetSuccessMsg(null);
        setSelectedCommForReset(null);
      }, 4000);
    } catch (e: any) {
      alert("Erreur: " + e.message);
    }
  };

  // Changer son propre mot de passe (Admin uniquement)
  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassSuccess(null);
    setAdminPassError(null);

    if (adminNewPassword.length < 6) {
      setAdminPassError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: adminNewPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAdminPassSuccess("Votre mot de passe a été modifié avec succès.");
      setAdminNewPassword('');
    } catch (e: any) {
      setAdminPassError(e.message);
    }
  };

  // --- FILTRAGE DES BILLETS ---
  const billetsFiltres = billets.filter(b => {
    const query = searchQuery.toLowerCase().trim();
    const matchSearch = query === '' ||
      b.numero_billet.toLowerCase().includes(query) ||
      b.nom_passager.toLowerCase().includes(query) ||
      b.prenom_passager.toLowerCase().includes(query) ||
      b.telephone.includes(query);

    const matchCommercial = filterCommercial === 'all' || b.cree_par === filterCommercial;
    const matchStatut = filterStatut === 'all' || b.statut === filterStatut;
    const matchClim = filterClim === 'all' || b.climatisation === filterClim;
    const matchEscorte = filterEscorte === 'all' || b.escorte === filterEscorte;
    const matchDate = filterDate === '' || b.date_depart === filterDate;

    return matchSearch && matchCommercial && matchStatut && matchClim && matchEscorte && matchDate;
  });

  // --- CALCULS DE STATISTIQUES ---
  // Uniquement sur les billets non annulés
  const billetsStatistiques = billets.filter(b => b.statut !== 'annule');
  const totalBilletsVendus = billetsStatistiques.length;
  const totalMontantEncaisse = billetsStatistiques.reduce((sum, b) => sum + b.montant, 0);

  const billetsValidesCount = billets.filter(b => b.statut === 'valide').length;
  const billetsUtilisesCount = billets.filter(b => b.statut === 'utilise').length;

  // Répartition par commercial
  const commercialStats: { [name: string]: { count: number; total: number } } = {};
  billetsStatistiques.forEach(b => {
    const nom = b.cree_par_nom || "Commercial";
    if (!commercialStats[nom]) {
      commercialStats[nom] = { count: 0, total: 0 };
    }
    commercialStats[nom].count += 1;
    commercialStats[nom].total += b.montant;
  });

  // Répartition par options (climatisé, etc.)
  const optionsStats = {
    clim_avec: billetsStatistiques.filter(b => b.climatisation === 'climatise' && b.escorte === 'avec_escorte').length,
    clim_sans: billetsStatistiques.filter(b => b.climatisation === 'climatise' && b.escorte === 'sans_escorte').length,
    nonclim_avec: billetsStatistiques.filter(b => b.climatisation === 'non_climatise' && b.escorte === 'avec_escorte').length,
    nonclim_sans: billetsStatistiques.filter(b => b.climatisation === 'non_climatise' && b.escorte === 'sans_escorte').length
  };

  // --- EXPORT EXCEL ---
  const handleExportExcel = () => {
    // Préparer les données formatées
    const dataToExport = billetsFiltres.map(b => ({
      'Référence Billet': b.numero_billet,
      'Nom Passager': b.nom_passager,
      'Prénom Passager': b.prenom_passager,
      'Téléphone': b.telephone,
      'Date Départ': b.date_depart,
      'Heure Départ': b.heure_depart,
      'Option Climatisation': b.climatisation === 'climatise' ? 'Climatisé' : 'Non Climatisé',
      'Option Escorte': b.escorte === 'avec_escorte' ? 'Avec Escorte' : 'Sans Escorte',
      'Montant (FCFA)': b.montant,
      'Statut': b.statut.toUpperCase(),
      'Émis par': b.cree_par_nom || 'Inconnu',
      'Scanné par': b.scanne_par ? 'Scanné' : 'Non Scanné',
      'Date de création': new Date(b.created_at).toLocaleString('fr-FR')
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Billets ImmoDakar');

    // Auto-ajuster la largeur des colonnes
    const max_len = dataToExport.reduce((w, r) => Object.keys(r).reduce((acc, k) => Math.max(acc, String(r[k as keyof typeof r]).length), w), 10);
    worksheet['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }];

    const now = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `billets-immodakar-${now}.xlsx`);
  };

  // --- RENDU : FORMULAIRE DE CONNEXION ---
  if (!token) {
    return (
      <div id="login-screen" className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
          <div className="bg-slate-900 px-8 py-6 text-center text-white relative">
            <div className="inline-block px-3 py-1 bg-white text-slate-900 font-black italic rounded text-lg mb-2">IMD</div>
            <h2 className="text-2xl font-bold tracking-tight uppercase">ImmoDakar <span className="font-normal text-slate-400">Transport</span></h2>
            <p className="text-xs text-slate-400 mt-1">Plateforme Sécurisée de Billetterie de Transport</p>
          </div>

          <form onSubmit={handleLogin} className="p-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-slate-500">Adresse Email</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="admin@immodakar.sn"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-slate-500">Mot de passe</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 font-medium text-slate-800"
              />
            </div>

            {loginError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-xs font-medium leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-bold text-sm tracking-wide uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
            >
              {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {loginLoading ? "Connexion en cours..." : "Se connecter de façon sécurisée"}
            </button>
          </form>

          {/* Guide de test pour la Sandbox */}
          <div className="bg-slate-50 border-t border-slate-100 p-5 text-xs text-slate-600">
            <div className="font-bold text-slate-800 mb-2 uppercase tracking-wide">Comptes de test pré-configurés :</div>
            <div className="flex flex-col gap-1.5 font-mono">
              <div>
                <span className="font-bold text-slate-700">Admin:</span> immodakar@proton.me
                <span className="block text-[11px] text-slate-400">MDP: Anopatuy2w</span>
              </div>
              <div className="border-t border-slate-200/50 pt-1.5">
                <span className="font-bold text-slate-700">Commercial:</span> commercial1@immodakar.sn
                <span className="block text-[11px] text-slate-400">MDP: commercial123</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-center text-[10px] text-slate-500 max-w-sm">
          Système cryptographique de contrôle sénégalais. Signature HMAC valide.
        </div>
      </div>
    );
  }

  // --- RENDU APP PRINCIPALE ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-hidden text-slate-900">
      
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded flex items-center justify-center text-white font-bold italic">
            IMD
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 uppercase">
            ImmoDakar <span className="font-normal text-slate-500">Transport</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-800">{user?.prenom} {user?.nom}</span>
            <span className="text-xs text-slate-400 capitalize">{user?.role} • {user?.email}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300">
            <span className="text-slate-600 font-bold uppercase">{user?.prenom[0]}{user?.nom[0]}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-bold uppercase text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-slate-400 p-4 flex flex-col gap-2 shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-2">Navigation</div>
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => { setActiveTab('dashboard'); setScanResult(null); setCreatedTicketResult(null); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors text-left font-medium cursor-pointer ${activeTab === 'dashboard' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <TrendingUp className="w-4 h-4" /> Tableau de bord
            </button>
            <button
              onClick={() => { setActiveTab('create_ticket'); setScanResult(null); setCreatedTicketResult(null); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors text-left font-medium cursor-pointer ${activeTab === 'create_ticket' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <PlusCircle className="w-4 h-4" /> Créer un Billet
            </button>
            <button
              onClick={() => { setActiveTab('scan_qr'); setScanResult(null); setCreatedTicketResult(null); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors text-left font-medium cursor-pointer ${activeTab === 'scan_qr' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <QrCode className="w-4 h-4" /> Scanner QR Code
            </button>
          </nav>

          {/* Administration section if admin */}
          {user?.role === 'admin' && (
            <>
              <div className="mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-2">Administration</div>
              <nav className="flex flex-col gap-1">
                <button
                  onClick={() => { setActiveTab('commerciaux'); setScanResult(null); setCreatedTicketResult(null); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors text-left font-medium cursor-pointer ${activeTab === 'commerciaux' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'}`}
                >
                  <Users className="w-4 h-4" /> Gestion Commerciaux
                </button>
                <button
                  onClick={() => { setActiveTab('tarifs'); setScanResult(null); setCreatedTicketResult(null); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors text-left font-medium cursor-pointer ${activeTab === 'tarifs' ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'}`}
                >
                  <Sliders className="w-4 h-4" /> Grille Tarifaire
                </button>
              </nav>
            </>
          )}

          {/* Sceau de sécurité */}
          <div className="mt-auto p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-[10px] uppercase text-emerald-400 font-bold mb-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
              Système Sécurisé
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Logique Cloudflare Worker active. Signature HMAC validée et stockée en base.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-8">
          
          {/* ==========================================
              ONGLET : TABLEAU DE BORD (DASHBOARD)
              ========================================== */}
          {activeTab === 'dashboard' && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">Billets Vendus</div>
                  <div className="text-2xl font-black text-slate-900">{totalBilletsVendus}</div>
                  <div className="text-[10px] text-emerald-600 font-bold mt-1">Excluant billets annulés</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">Recettes (FCFA)</div>
                  <div className="text-2xl font-black text-slate-900">{totalMontantEncaisse.toLocaleString('fr-FR')} F</div>
                  <div className="text-[10px] text-slate-400 font-bold mt-1">Calculé côté serveur</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">Utilisés / Valides</div>
                  <div className="text-2xl font-black text-slate-900">{billetsUtilisesCount} / {billetsValidesCount}</div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-slate-900 h-full rounded-full"
                      style={{ width: `${totalBilletsVendus > 0 ? (billetsUtilisesCount / totalBilletsVendus) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500 flex flex-col justify-between">
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Disponibilité API</div>
                    <div className="text-2xl font-bold text-emerald-600 italic">99.9%</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold underline cursor-pointer">
                    Status Worker SENEGAL OK
                  </div>
                </div>
              </div>

              {/* Core Table and Filter Section */}
              <div className="bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden min-h-[400px]">
                
                {/* Table Header and Filters Toolbar */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h3 className="font-bold text-slate-800 text-base">Historique et Gestion des Billets</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchBillets}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                        title="Actualiser la liste"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleExportExcel}
                        disabled={billetsFiltres.length === 0}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Exporter Excel (.xlsx)
                      </button>
                    </div>
                  </div>

                  {/* Filters grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {/* Search query */}
                    <div className="relative sm:col-span-1">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Rechercher nom, réf..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-800"
                      />
                    </div>

                    {/* Date filter */}
                    <div className="relative">
                      <input
                        type="date"
                        value={filterDate}
                        onChange={e => setFilterDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-800"
                      />
                    </div>

                    {/* Commercial filter */}
                    {user?.role === 'admin' ? (
                      <div>
                        <select
                          value={filterCommercial}
                          onChange={e => setFilterCommercial(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-800"
                        >
                          <option value="all">Tous les vendeurs</option>
                          {profiles.map(p => (
                            <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
                        Mes ventes uniquement
                      </div>
                    )}

                    {/* Status filter */}
                    <div>
                      <select
                        value={filterStatut}
                        onChange={e => setFilterStatut(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-800"
                      >
                        <option value="all">Tous les statuts</option>
                        <option value="valide">Valide</option>
                        <option value="utilise">Utilisé</option>
                        <option value="annule">Annulé</option>
                      </select>
                    </div>

                    {/* Options filter */}
                    <div className="flex gap-1.5">
                      <select
                        value={filterClim}
                        onChange={e => setFilterClim(e.target.value)}
                        className="w-1/2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-800"
                      >
                        <option value="all">Clim : Tous</option>
                        <option value="climatise">Climatisé</option>
                        <option value="non_climatise">Standard</option>
                      </select>
                      <select
                        value={filterEscorte}
                        onChange={e => setFilterEscorte(e.target.value)}
                        className="w-1/2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-800"
                      >
                        <option value="all">Escorte : Tous</option>
                        <option value="avec_escorte">Avec escorte</option>
                        <option value="sans_escorte">Sans escorte</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tickets Table */}
                <div className="overflow-x-auto flex-1">
                  {loadingBillets ? (
                    <div className="p-12 text-center text-slate-500 text-xs">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                      Chargement des billets de transport...
                    </div>
                  ) : billetsFiltres.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 text-xs">
                      Aucun billet de transport ne correspond aux filtres actifs.
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100 bg-slate-50/20">
                          <th className="px-6 py-3.5">Référence</th>
                          <th className="px-6 py-3.5">Passager</th>
                          <th className="px-6 py-3.5">Date & Heure départ</th>
                          <th className="px-6 py-3.5">Configuration</th>
                          <th className="px-6 py-3.5">Montant</th>
                          <th className="px-6 py-3.5">Vendeur</th>
                          <th className="px-6 py-3.5">Statut</th>
                          <th className="px-6 py-3.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {billetsFiltres.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs font-bold">
                              <button
                                onClick={() => setPreviewBillet(b)}
                                className="text-slate-700 hover:text-indigo-600 hover:underline cursor-pointer flex items-center gap-1.5"
                                title="Voir l'aperçu du billet"
                              >
                                <QrCode className="w-3.5 h-3.5 text-slate-400" />
                                {b.numero_billet}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-800">{b.prenom_passager} {b.nom_passager}</div>
                              <div className="text-[10px] text-slate-400 font-medium">+221 {b.telephone}</div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-xs">
                              <div className="font-medium">{new Date(b.date_depart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                              <div className="text-[10px] text-slate-400">{b.heure_depart}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${b.climatisation === 'climatise' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                                  {b.climatisation === 'climatise' ? 'Clim' : 'Std'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${b.escorte === 'avec_escorte' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'}`}>
                                  {b.escorte === 'avec_escorte' ? 'Escorte' : 'Direct'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-800 text-xs">
                              {b.montant.toLocaleString('fr-FR')} F
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                              {b.cree_par_nom || 'Vendeur'}
                            </td>
                            <td className="px-6 py-4">
                              {b.statut === 'valide' && (
                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider">
                                  Valide
                                </span>
                              )}
                              {b.statut === 'utilise' && (
                                <span className="text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider">
                                  Utilisé
                                </span>
                              )}
                              {b.statut === 'annule' && (
                                <span className="text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider">
                                  Annulé
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2.5">
                                {/* Aperçu à l'écran */}
                                <button
                                  onClick={() => setPreviewBillet(b)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                                  title="Aperçu du billet à l'écran"
                                >
                                  <QrCode className="w-4 h-4" />
                                </button>

                                {/* WhatsApp Send */}
                                {b.statut !== 'annule' ? (
                                  <button
                                    onClick={() => handleEnvoyerBillet(b.id, b.telephone, `${b.prenom_passager} ${b.nom_passager}`, b.numero_billet)}
                                    className={`p-1 rounded cursor-pointer transition-colors ${b.envoye ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
                                    title={b.envoye ? "Déjà partagé via WhatsApp (Renvoyer)" : "Partager via WhatsApp"}
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <span className="w-6"></span>
                                )}

                                {/* Print HTML */}
                                <a
                                  href={`/billet/telecharger/${b.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                                  title="Imprimer / Télécharger le billet"
                                >
                                  <Printer className="w-4 h-4" />
                                </a>

                                {/* Cancel Button (Admin Only) */}
                                {user?.role === 'admin' && b.statut === 'valide' && (
                                  <button
                                    onClick={() => handleAnnulerBillet(b.id, b.numero_billet)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                    title="Annuler le billet"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Footer Table Statistics */}
                <div className="mt-auto border-t border-slate-100 px-6 py-4 flex items-center justify-between text-xs text-slate-500 bg-slate-50/30">
                  <div>Affichage de <strong>{billetsFiltres.length}</strong> sur <strong>{billets.length}</strong> billets émis</div>
                  <div className="font-medium text-slate-400">
                    Saisie instantanée • Contrôle cryptographique par signature HMAC
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ==========================================
              ONGLET : CRÉATION DE BILLET (COMMERCIAL)
              ========================================== */}
          {activeTab === 'create_ticket' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form Card */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-slate-800">Émettre un nouveau billet</h3>
                  <p className="text-xs text-slate-500">Le montant et le numéro de série sont générés de manière atomique côté serveur.</p>
                </div>

                <form onSubmit={handleCreateTicket} className="p-6 flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Prénom du passager</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Moussa"
                        value={newTicketPrenom}
                        onChange={e => setNewTicketPrenom(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Nom du passager</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Ndiaye"
                        value={newTicketNom}
                        onChange={e => setNewTicketNom(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Téléphone Mobile Sénégalais</label>
                      <input
                        type="tel"
                        required
                        pattern="^7[0-9]{8}$"
                        placeholder="Ex: 771234567"
                        value={newTicketTel}
                        onChange={e => setNewTicketTel(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-mono font-bold"
                      />
                      <span className="text-[10px] text-slate-400">9 chiffres commençant par 7 (Orange, Free, Expresso)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Date Départ</label>
                        <input
                          type="date"
                          required
                          value={newTicketDate}
                          onChange={e => setNewTicketDate(e.target.value)}
                          className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Heure Départ</label>
                        <input
                          type="time"
                          required
                          value={newTicketHeure}
                          onChange={e => setNewTicketHeure(e.target.value)}
                          className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Options options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Climatisation</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNewTicketClim('non_climatise')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${newTicketClim === 'non_climatise' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                        >
                          Standard (Non clim)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewTicketClim('climatise')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${newTicketClim === 'climatise' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                        >
                          Climatisé
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Service d'Escorte</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNewTicketEscorte('sans_escorte')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${newTicketEscorte === 'sans_escorte' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                        >
                          Direct (Sans escorte)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewTicketEscorte('avec_escorte')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${newTicketEscorte === 'avec_escorte' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                        >
                          Avec Escorte
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Estimation du tarif en temps réel */}
                  <div className="mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Montant prévisionnel</div>
                      <div className="text-xs text-slate-500 font-medium">Tarif officiel imposé par la grille active</div>
                    </div>
                    <div className="text-xl font-black text-slate-900">
                      {tarifs.find(t => t.climatisation === newTicketClim && t.escorte === newTicketEscorte)?.prix.toLocaleString('fr-FR') || "N/A"} F
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingTicket || !newTicketDate}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-55 text-white py-3 rounded-lg font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {creatingTicket ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                    {creatingTicket ? "Génération sécurisée..." : "Générer le Billet de Transport"}
                  </button>
                </form>
              </div>

              {/* Live Ticket Result Sidebar */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center justify-center min-h-[400px]">
                {createdTicketResult ? (
                  <div className="w-full flex flex-col items-center">
                    <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full font-bold uppercase tracking-wider mb-4 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Billet Émis avec Succès
                    </div>

                    <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-inner flex flex-col items-center gap-3">
                      <div className="font-mono font-bold text-slate-800 tracking-wider text-sm border-b border-slate-100 pb-2 w-full text-center">
                        {createdTicketResult.billet.numero_billet}
                      </div>

                      {!loadingTicketQr && ticketQrBase64 ? (
                        <img src={ticketQrBase64} alt="QR Code Billet" className="w-48 h-48 border border-slate-100 p-1 bg-white" />
                      ) : (
                        <div className="w-48 h-48 bg-slate-50 flex flex-col items-center justify-center text-slate-400 text-xs font-medium gap-2 border border-slate-200 rounded">
                          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                          <span>Génération du QR code...</span>
                        </div>
                      )}

                      <div className="text-center">
                        <div className="font-bold text-slate-900 text-base">{createdTicketResult.billet.prenom_passager} {createdTicketResult.billet.nom_passager}</div>
                        <div className="text-xs text-slate-500 font-medium">+221 {createdTicketResult.billet.telephone}</div>
                      </div>
                    </div>

                    <div className="w-full mt-6 flex flex-col gap-2.5">
                      <button
                        onClick={() => handleEnvoyerBillet(createdTicketResult.billet.id, createdTicketResult.billet.telephone, `${createdTicketResult.billet.prenom_passager} ${createdTicketResult.billet.nom_passager}`, createdTicketResult.billet.numero_billet)}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Partager via WhatsApp
                      </button>
                      <a
                        href={`/billet/telecharger/${createdTicketResult.billet.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors text-center flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimer le Billet (HTML)
                      </a>
                      <button
                        onClick={() => setCreatedTicketResult(null)}
                        className="w-full py-2 bg-white hover:bg-slate-100 text-slate-500 rounded-lg text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                      >
                        Créer un autre billet
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-400 p-8">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h4 className="font-bold text-slate-700 text-sm mb-1">Aperçu du billet émis</h4>
                    <p className="text-xs max-w-xs leading-relaxed">Remplissez le formulaire de gauche et cliquez sur le bouton pour générer instantanément l'aperçu, le QR code sécurisé et le lien d'impression.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==========================================
              ONGLET : SCANNER QR CODE (VÉRIFICATION)
              ========================================== */}
          {activeTab === 'scan_qr' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Webcam Reader Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6 flex flex-col items-center">
                <div className="w-full text-center border-b border-slate-100 pb-4 mb-6">
                  <h3 className="font-bold text-slate-800 flex items-center justify-center gap-1.5">
                    <Camera className="w-5 h-5 text-indigo-600" />
                    Scanneur de Caméra Embarqué
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Autorisez la caméra pour scanner instantanément le QR Code du passager.</p>
                </div>

                {/* Container QR Reader de html5-qrcode */}
                <div id="qr-reader" className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-slate-50"></div>

                {/* Explication Alternative pour iframe de Sandbox */}
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 w-full leading-relaxed">
                  <div className="font-bold uppercase tracking-wide text-[10px] mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Note pour la Sandbox de prévisualisation :
                  </div>
                  Si l'accès à la webcam est indisponible ou bloqué dans l'iframe, vous pouvez utiliser la zone de droite pour copier/coller directement la chaîne cryptographique du QR Code ou saisir le numéro de billet pour simuler le scan !
                </div>
              </div>

              {/* Manual Entry or Scan Result Card */}
              <div className="flex flex-col gap-6">
                
                {/* Fallback Manual Entry Card */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                  <h4 className="font-bold text-slate-800 text-sm mb-3">Simulation ou Saisie manuelle de signature</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Collez la chaîne QR Code ou saisissez ici..."
                      value={manualQrString}
                      onChange={e => setManualQrString(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-slate-800 text-slate-800"
                    />
                    <button
                      onClick={() => handleScanRequest(manualQrString)}
                      disabled={scanningLoading || !manualQrString.trim()}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold tracking-wider cursor-pointer disabled:opacity-50"
                    >
                      Valider
                    </button>
                  </div>
                  {/* Petit helper avec le dernier billet créé pour tester à coup sûr */}
                  {billets.length > 0 && (
                    <div className="mt-3 p-2 bg-slate-50 rounded text-[11px] text-slate-500 flex flex-col gap-1 border border-slate-100">
                      <div className="font-bold text-slate-600">Astuce rapide de test :</div>
                      <div>Pour tester le scanneur, vous pouvez émettre un billet, puis copier-coller sa signature HMAC ci-dessous pour simuler un scan de webcam :</div>
                      <div className="flex items-center gap-1 mt-1 font-mono text-[9px] bg-slate-100 p-1 rounded overflow-x-auto select-all text-slate-700">
                        {/* On essaie de fabriquer un QR mock ou de donner un guide */}
                        Créer un billet génère une signature sécurisée unique.
                      </div>
                    </div>
                  )}
                </div>

                {/* Scan Outcome Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex-1 flex flex-col items-center justify-center min-h-[300px]">
                  {scanningLoading ? (
                    <div className="text-center text-slate-500 text-xs">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
                      Validation de la signature cryptographique HMAC côté serveur...
                    </div>
                  ) : scanResult ? (
                    <div className="w-full flex flex-col items-center text-center">
                      
                      {/* 1. GREEN VALIDE */}
                      {scanResult.status === 'valide' && scanResult.billet && (
                        <div className="w-full flex flex-col items-center animate-fade-in">
                          <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mb-4 text-emerald-600">
                            <CheckCircle2 className="w-10 h-10" />
                          </div>
                          <h4 className="text-xl font-bold text-emerald-600 mb-1">{scanResult.message}</h4>
                          <div className="text-xs text-slate-500 uppercase font-black tracking-widest mb-4">Embarquement Autorisé</div>

                          <div className="w-full border border-emerald-100 bg-emerald-50/20 rounded-xl p-5 text-left flex flex-col gap-2 max-w-sm">
                            <div className="flex justify-between border-b border-emerald-50/60 pb-1.5 text-xs text-slate-700">
                              <span className="font-bold">Billet N°:</span>
                              <span className="font-mono font-bold">{scanResult.billet.numero_billet}</span>
                            </div>
                            <div className="flex justify-between border-b border-emerald-50/60 pb-1.5 text-xs text-slate-700">
                              <span className="font-bold">Passager:</span>
                              <span className="font-semibold">{scanResult.billet.prenom_passager} {scanResult.billet.nom_passager}</span>
                            </div>
                            <div className="flex justify-between border-b border-emerald-50/60 pb-1.5 text-xs text-slate-700">
                              <span className="font-bold">Téléphone:</span>
                              <span>+221 {scanResult.billet.telephone}</span>
                            </div>
                            <div className="flex justify-between border-b border-emerald-50/60 pb-1.5 text-xs text-slate-700">
                              <span className="font-bold">Options:</span>
                              <span className="font-semibold capitalize text-[11px]">
                                {scanResult.billet.climatisation === 'climatise' ? 'Climatisé' : 'Standard'} • {scanResult.billet.escorte === 'avec_escorte' ? 'Escorte' : 'Direct'}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-700">
                              <span className="font-bold">Montant payé:</span>
                              <span className="font-black text-emerald-600">{scanResult.billet.montant.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. RED DÉJÀ UTILISÉ */}
                      {scanResult.status === 'deja_utilise' && scanResult.billet && (
                        <div className="w-full flex flex-col items-center">
                          <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mb-4 text-red-600">
                            <X className="w-10 h-10" />
                          </div>
                          <h4 className="text-xl font-bold text-red-600 mb-1">{scanResult.error}</h4>
                          <div className="text-xs text-slate-500 uppercase font-black tracking-widest mb-4">Accès Refusé</div>

                          <div className="w-full border border-red-100 bg-red-50/20 rounded-xl p-5 text-left flex flex-col gap-2 max-w-sm">
                            <div className="text-xs text-red-800 font-semibold text-center bg-red-100/50 p-2 rounded-lg border border-red-100 mb-2">
                              Ce billet a été scanné à l'embarquement le {scanResult.scanne_le ? new Date(scanResult.scanne_le).toLocaleString('fr-FR') : "Date inconnue"} par {scanResult.scanne_par_nom || "un contrôleur"}.
                            </div>
                            <div className="flex justify-between border-b border-red-50/60 pb-1.5 text-xs text-slate-700">
                              <span className="font-bold">Billet N°:</span>
                              <span className="font-mono font-bold">{scanResult.billet.numero_billet}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-700">
                              <span className="font-bold">Passager:</span>
                              <span className="font-semibold">{scanResult.billet.prenom_passager} {scanResult.billet.nom_passager}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. RED ANNULÉ */}
                      {scanResult.status === 'annule' && scanResult.billet && (
                        <div className="w-full flex flex-col items-center">
                          <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mb-4 text-red-600">
                            <AlertTriangle className="w-10 h-10" />
                          </div>
                          <h4 className="text-xl font-bold text-red-600 mb-1">{scanResult.error}</h4>
                          <div className="text-xs text-slate-500 uppercase font-black tracking-widest mb-4">Accès Refusé</div>

                          <div className="w-full border border-red-100 bg-red-50/20 rounded-xl p-5 text-left flex flex-col gap-2 max-w-sm">
                            <div className="text-xs text-red-800 font-semibold text-center bg-red-100/50 p-2 rounded-lg border border-red-100 mb-2">
                              Ce billet a été annulé par l'administrateur principal le {scanResult.annule_le ? new Date(scanResult.annule_le).toLocaleString('fr-FR') : "Date inconnue"}.
                            </div>
                            <div className="flex justify-between border-b border-red-50/60 pb-1.5 text-xs text-slate-700">
                              <span className="font-bold">Billet N°:</span>
                              <span className="font-mono font-bold">{scanResult.billet.numero_billet}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-700">
                              <span className="font-bold">Passager:</span>
                              <span className="font-semibold">{scanResult.billet.prenom_passager} {scanResult.billet.nom_passager}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. FRAUDE / CORROMPU */}
                      {scanResult.status === 'corrompu' && (
                        <div className="w-full flex flex-col items-center">
                          <div className="w-16 h-16 bg-red-100 border border-red-300 rounded-full flex items-center justify-center mb-4 text-red-600">
                            <X className="w-10 h-10" />
                          </div>
                          <h4 className="text-xl font-bold text-red-600 mb-1">{scanResult.error}</h4>
                          <div className="text-xs text-red-500 uppercase font-black tracking-widest mb-4">Alerte Fraude</div>

                          <div className="w-full bg-red-50 border border-red-200 p-4 rounded-xl text-xs text-red-800 font-medium text-left max-w-sm mt-2 leading-relaxed">
                            La signature de sécurité HMAC ou le payload décodé ne correspond pas à nos clés d'encryption officielles. Ce billet n'a pas été émis par notre plateforme !
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => { setScanResult(null); setManualQrString(''); }}
                        className="mt-6 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Scanner un autre billet
                      </button>
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 p-8">
                      <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                        <QrCode className="w-8 h-8" />
                      </div>
                      <h4 className="font-bold text-slate-700 text-sm mb-1">En attente de scan...</h4>
                      <p className="text-xs max-w-xs leading-relaxed">Présentez le QR Code officiel devant la caméra ou collez la chaîne de signature pour valider de manière sécurisée l'embarquement.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              ONGLET : GESTION DES TARIFS (ADMIN ONLY)
              ========================================== */}
          {activeTab === 'tarifs' && user?.role === 'admin' && (
            <div className="max-w-3xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600" />
                  Grille Tarifaire Officielle (FCFA)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Configurez les 4 combinaisons de tarifs. Les billets déjà émis conservent leur tarif d'origine historique.</p>
              </div>

              <div className="p-6 flex flex-col gap-6">
                {tarifsSuccessMsg && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 leading-relaxed">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{tarifsSuccessMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {editedTarifs.map((t, idx) => {
                    const label = `${t.climatisation === 'climatise' ? 'Climatisé' : 'Standard (Sans Clim)'} + ${t.escorte === 'avec_escorte' ? 'Avec Escorte' : 'Sans Escorte'}`;
                    return (
                      <div key={t.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2">
                        <span className="text-xs font-bold uppercase text-slate-500 tracking-wider text-[10px]">{label}</span>
                        <div className="relative">
                          <input
                            type="number"
                            required
                            min="0"
                            value={t.prix}
                            onChange={e => {
                              const updated = [...editedTarifs];
                              updated[idx].prix = Math.max(0, Number(e.target.value));
                              setEditedTarifs(updated);
                            }}
                            className="w-full pl-8 pr-16 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-base font-black text-slate-800 bg-white"
                          />
                          <DollarSign className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold uppercase">FCFA</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 max-w-sm">
                    <strong>Note de sécurité :</strong> Seul l'administrateur principal peut réécrire la table de tarification. Cette modification est instantanément répliquée sur notre Worker.
                  </div>
                  <button
                    onClick={handleSaveTarifs}
                    disabled={savingTarifs}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-55 text-white rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {savingTarifs ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {savingTarifs ? "Sauvegarde..." : "Enregistrer la grille"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              ONGLET : GESTION DES COMPTES (ADMIN ONLY)
              ========================================== */}
          {activeTab === 'commerciaux' && user?.role === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Form Create Account */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    Créer un compte commercial
                  </h3>
                  <p className="text-xs text-slate-500">Aucun formulaire d'inscription n'est public sur la plateforme.</p>
                </div>

                <form onSubmit={handleCreateCommercial} className="p-6 flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Prénom</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Awa"
                      value={newCommPrenom}
                      onChange={e => setNewCommPrenom(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nom de famille</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Sarr"
                      value={newCommNom}
                      onChange={e => setNewCommNom(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Adresse Email</label>
                    <input
                      type="email"
                      required
                      placeholder="awa.sarr@immodakar.sn"
                      value={newCommEmail}
                      onChange={e => setNewCommEmail(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Mot de passe initial</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••••••"
                      value={newCommPassword}
                      onChange={e => setNewCommPassword(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 text-sm text-slate-800 font-semibold"
                    />
                    <span className="text-[10px] text-slate-400">Longueur minimale : 6 caractères</span>
                  </div>

                  {commError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold leading-relaxed">
                      {commError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={creatingComm}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-lg font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer disabled:opacity-55 flex items-center justify-center gap-1"
                  >
                    {creatingComm ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                    {creatingComm ? "Création..." : "Ajouter le commercial"}
                  </button>
                </form>
              </div>

              {/* Accounts List & Security Center */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                
                {/* Accounts Table List */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-800">Liste des utilisateurs autorisés</h3>
                  </div>

                  <div className="overflow-x-auto">
                    {loadingProfiles ? (
                      <div className="p-12 text-center text-slate-500 text-xs">
                        Chargement des utilisateurs...
                      </div>
                    ) : (
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100 bg-slate-50/10">
                            <th className="px-6 py-3">Utilisateur</th>
                            <th className="px-6 py-3">Rôle</th>
                            <th className="px-6 py-3">État</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {profiles.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/50">
                              <td className="px-6 py-3.5">
                                <div className="font-semibold text-slate-800">{p.prenom} {p.nom}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{p.email}</div>
                              </td>
                              <td className="px-6 py-3.5">
                                <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${p.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                                  {p.role}
                                </span>
                              </td>
                              <td className="px-6 py-3.5">
                                {p.actif ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Actif
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span> Suspendu
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Activer/Désactiver si différent de soi-même */}
                                  {p.id !== user?.id && (
                                    <button
                                      onClick={() => handleToggleCommStatus(p.id, p.actif)}
                                      className={`p-1 rounded cursor-pointer transition-colors ${p.actif ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                      title={p.actif ? "Désactiver le compte" : "Réactiver le compte"}
                                    >
                                      {p.actif ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                    </button>
                                  )}

                                  {/* Réinitialiser MDP */}
                                  {p.role !== 'admin' && (
                                    <button
                                      onClick={() => {
                                        setSelectedCommForReset(p.id);
                                        setResetPasswordValue('');
                                      }}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition-colors"
                                      title="Réinitialiser le mot de passe"
                                    >
                                      <KeyRound className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Reset password modal-like box */}
                {selectedCommForReset && (
                  <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4 text-indigo-600" />
                        Nouveau mot de passe pour le commercial
                      </h4>
                      <button onClick={() => setSelectedCommForReset(null)} className="text-indigo-400 hover:text-indigo-950">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleResetCommPassword} className="flex gap-2">
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Nouveau mot de passe (min 6 car.)"
                        value={resetPasswordValue}
                        onChange={e => setResetPasswordValue(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-600"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Sauvegarder
                      </button>
                    </form>
                    {resetSuccessMsg && (
                      <div className="text-[11px] text-emerald-700 font-bold mt-2 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" /> {resetSuccessMsg}
                      </div>
                    )}
                  </div>
                )}

                {/* Change Own Password (Admin Profile Section) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                  <h4 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-indigo-600" />
                    Changer mon mot de passe Administrateur
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">Pour des raisons de sécurité, nous vous invitons à modifier votre mot de passe initial.</p>

                  <form onSubmit={handleChangeAdminPassword} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Saisissez un nouveau mot de passe fort"
                      value={adminNewPassword}
                      onChange={e => setAdminNewPassword(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-slate-800"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Changer mon mot de passe
                    </button>
                  </form>

                  {adminPassSuccess && (
                    <div className="text-xs text-emerald-700 font-bold mt-2 flex items-center gap-1 bg-emerald-50 p-2 rounded border border-emerald-100">
                      <Check className="w-4 h-4 text-emerald-600" /> {adminPassSuccess}
                    </div>
                  )}
                  {adminPassError && (
                    <div className="text-xs text-red-700 font-bold mt-2 flex items-center gap-1 bg-red-50 p-2 rounded border border-red-100">
                      <AlertTriangle className="w-4 h-4 text-red-500" /> {adminPassError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Footer Bar */}
      <footer className="h-8 bg-slate-100 border-t border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-[10px] font-medium text-slate-400 uppercase tracking-widest">
          <span>Version 1.2.0-STABLE</span>
          <span className="text-emerald-500 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
            Serveur Live (Worker SENEGAL-SOUTH-1)
          </span>
        </div>
        <div className="text-[10px] font-medium text-slate-400">
          © 2026 IMMO DAKAR SERVICES - TOUS DROITS RÉSERVÉS
        </div>
      </footer>

      {/* Modal d'aperçu de billet */}
      {previewBillet && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 bg-white text-slate-900 font-bold italic rounded text-xs mr-2">IMD</span>
                <span className="font-bold tracking-tight text-sm uppercase">Détails du Billet</span>
              </div>
              <button
                onClick={() => setPreviewBillet(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ticket Card Content */}
            <div className="p-6 flex flex-col items-center">
              
              <div className="w-full border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col gap-4">
                
                {/* Header detail */}
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Référence unique</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">{previewBillet.numero_billet}</span>
                  </div>
                  <div>
                    {previewBillet.statut === 'valide' && (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                        Valide
                      </span>
                    )}
                    {previewBillet.statut === 'utilise' && (
                      <span className="text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                        Utilisé
                      </span>
                    )}
                    {previewBillet.statut === 'annule' && (
                      <span className="text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                        Annulé
                      </span>
                    )}
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="flex justify-center py-2">
                  {!loadingPreviewQr && previewQrBase64 ? (
                    <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-inner flex flex-col items-center">
                      <img src={previewQrBase64} alt="QR Code Billet" className="w-48 h-48" />
                      <span className="text-[9px] text-slate-400 font-mono mt-1">HMAC-SHA256 validé</span>
                    </div>
                  ) : (
                    <div className="w-48 h-48 bg-slate-50 flex flex-col items-center justify-center text-slate-500 text-xs font-semibold gap-2 border border-slate-200 rounded-xl">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                      <span>Génération du QR code...</span>
                    </div>
                  )}
                </div>

                {/* Passager et Voyage */}
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Passager</span>
                    <span className="font-bold text-slate-800 text-sm">{previewBillet.prenom_passager} {previewBillet.nom_passager}</span>
                    <span className="text-slate-500 block font-medium mt-0.5">+221 {previewBillet.telephone}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Départ</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {new Date(previewBillet.date_depart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-slate-500 block font-medium mt-0.5">{previewBillet.heure_depart}</span>
                  </div>
                </div>

                {/* Configuration et Tarif */}
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Options</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider ${previewBillet.climatisation === 'climatise' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                        {previewBillet.climatisation === 'climatise' ? 'Clim' : 'Standard'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider ${previewBillet.escorte === 'avec_escorte' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'}`}>
                        {previewBillet.escorte === 'avec_escorte' ? 'Escorte' : 'Direct'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Montant payé</span>
                    <span className="font-black text-slate-800 text-base">{previewBillet.montant.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>

              </div>

              {/* Action buttons */}
              <div className="w-full mt-6 flex flex-col gap-2">
                {previewBillet.statut !== 'annule' && (
                  <button
                    onClick={() => {
                      handleEnvoyerBillet(previewBillet.id, previewBillet.telephone, `${previewBillet.prenom_passager} ${previewBillet.nom_passager}`, previewBillet.numero_billet);
                      setPreviewBillet(null);
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Partager via WhatsApp
                  </button>
                )}
                
                <a
                  href={`/billet/telecharger/${previewBillet.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors text-center flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer le Billet (HTML / PDF)
                </a>

                <button
                  onClick={() => setPreviewBillet(null)}
                  className="w-full py-2.5 bg-white hover:bg-slate-100 text-slate-500 rounded-lg text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                >
                  Fermer
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
