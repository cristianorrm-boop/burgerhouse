// Conexão real ao Firebase para as ferramentas (somente navegador, somente localhost).
// Ignora o modo DEMO: ferramentas sempre falam com o banco de verdade.
import { firebaseConfig, FIREBASE_SDK } from '/js/config.js';

export function exigirLocalhost() {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const msg = 'Esta ferramenta só roda em localhost. Abra http://localhost:5502/ferramentas/.';
    document.body.innerHTML = `<main><p class="erro">${msg}</p></main>`;
    throw new Error(msg);
  }
}

let cache = null;
export async function conectar() {
  if (cache) return cache;
  const [appM, fsM, authM] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`)
  ]);
  const app = appM.initializeApp(firebaseConfig);
  cache = { fs: fsM.getFirestore(app), F: fsM, A: authM, auth: authM.getAuth(app) };
  return cache;
}

export async function entrar(email, senha) {
  const { A, auth } = await conectar();
  return A.signInWithEmailAndPassword(auth, email, senha);
}
