// =====================================================================
//  CONFIGURAÇÃO DO FIREBASE — Burger House (projeto moda-63d8d)
//
//  Modo demo (dados só neste navegador, localStorage): ligado se apiKey
//  estiver vazia, ou em localhost/127.0.0.1 abrindo com ?demo=1 (vale até
//  fechar a aba). Em produção o ?demo=1 é ignorado.
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyBp1eTgDKPzj1ZqJ-FYS5j_BBQvgopXUIk",
  authDomain: "moda-63d8d.firebaseapp.com",
  projectId: "moda-63d8d",
  storageBucket: "moda-63d8d.firebasestorage.app",
  messagingSenderId: "934925972260",
  appId: "1:934925972260:web:2208d5eefc8706b58f39b1"
};

// E-mail do SUPERADMIN (dono do sistema). Já existe em Firebase › Authentication.
// Deve ser o mesmo e-mail da função superadmin() em firestore.rules.
export const SUPERADMIN_EMAIL = "admin@gmail.com";

function demoLocal() {
  try {
    if (typeof location === 'undefined' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return false;
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1') sessionStorage.setItem('bh_demo', '1');
    if (q === '0') sessionStorage.removeItem('bh_demo');
    return sessionStorage.getItem('bh_demo') === '1';
  } catch { return false; }
}

export const DEMO = !firebaseConfig.apiKey || demoLocal();

// Versão do SDK do Firebase carregada via CDN (não precisa de npm)
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";
