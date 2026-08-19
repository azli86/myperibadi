import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDl7ZC5T3hdRaGlaP6qMYOQyx3u8xUbvEs",
  authDomain: "digitalport-d23f0.firebaseapp.com",
  projectId: "digitalport-d23f0",
  storageBucket: "digitalport-d23f0.firebasestorage.app",
  messagingSenderId: "968953639969",
  appId: "1:968953639969:web:fde4422f15ecda53375f60",
};

let auth: Auth | null = null;

function getFirebaseAuth(): Auth {
  if (!auth) {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
  }
  return auth;
}

export async function signInWithGoogle(): Promise<string> {
  const a = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(a, provider);
  return await result.user.getIdToken();
}
