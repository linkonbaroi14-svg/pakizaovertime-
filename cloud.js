// Online features (optional). Loaded only when the user opens the online account, so the app still works fully offline.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { FIREBASE_CONFIG, BKASH_NUMBER, SUPERVISOR_PRICE } from "./firebase-config.js";
export { BKASH_NUMBER, SUPERVISOR_PRICE };

const app = initializeApp(FIREBASE_CONFIG), auth = getAuth(app), db = getFirestore(app);
const uid = () => { if (!auth.currentUser) throw new Error("signin"); return auth.currentUser.uid; };

export const onUser = cb => onAuthStateChanged(auth, cb);
export const signIn = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
export const signUp = (email, pass) => createUserWithEmailAndPassword(auth, email, pass);
export const logOut = () => signOut(auth);
export const resetPassword = email => sendPasswordResetEmail(auth, email);

// ---- Worker side: own data + share code
export async function pushWorker(payload) {
  await setDoc(doc(db, "workers", uid()), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}
export async function getMyWorker() { const s = await getDoc(doc(db, "workers", uid())); return s.exists() ? s.data() : null; }

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ALPHABET[b % ALPHABET.length]).join("");
export async function ensureCode() {
  const me = await getMyWorker(); if (me && me.shareCode) return me.shareCode;
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    try {
      await setDoc(doc(db, "codes", code), { uid: uid() });
      await setDoc(doc(db, "workers", uid()), { shareCode: code }, { merge: true });
      return code;
    } catch (e) { /* code already used: try another */ }
  }
  throw new Error("code");
}
export async function stopSharing() {
  const me = await getMyWorker();
  if (me && me.shareCode) await deleteDoc(doc(db, "codes", me.shareCode));
  await setDoc(doc(db, "workers", uid()), { shareCode: "" }, { merge: true });
  const links = await getDocs(query(collection(db, "links"), where("workerUid", "==", uid())));
  await Promise.all(links.docs.map(d => deleteDoc(d.ref)));
}

// ---- Supervisor side (read-only; "active" is switched on by the app owner in the Firebase console)
export async function isSupervisor() {
  try { const s = await getDoc(doc(db, "supervisors", uid())); return s.exists() && s.data().active === true; } catch (e) { return false; }
}
export async function linkWorker(code) {
  const c = await getDoc(doc(db, "codes", code)); if (!c.exists()) throw new Error("nocode");
  const workerUid = c.data().uid; if (workerUid === uid()) throw new Error("self");
  await setDoc(doc(db, "links", workerUid + "_" + uid()), { workerUid, supUid: uid(), createdAt: serverTimestamp() });
}
export async function listWorkers() {
  const links = await getDocs(query(collection(db, "links"), where("supUid", "==", uid())));
  return Promise.all(links.docs.map(async d => {
    let data = null;
    try { const s = await getDoc(doc(db, "workers", d.data().workerUid)); data = s.exists() ? s.data() : null; } catch (e) { /* access not active */ }
    return { linkId: d.id, data };
  }));
}
export const unlink = linkId => deleteDoc(doc(db, "links", linkId));
