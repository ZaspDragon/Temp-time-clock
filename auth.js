import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

function setMsg(msg){
  const el = $("msg");
  if(el) el.textContent = msg || "";
}

function page(){
  return location.pathname.split("/").pop() || "index.html";
}

async function getRole(uid){
  const snap = await getDoc(doc(db, "users", uid));
  if(!snap.exists()) return "employee";
  return snap.data().role || "employee";
}

async function routeByRole(user){
  const role = await getRole(user.uid);
  if(role === "manager"){
    location.href = "manager.html";
  }else{
    location.href = "employee.html";
  }
}

// Login page
const loginForm = $("loginForm");
if(loginForm){
  $("gotoSignup").addEventListener("click", () => location.href = "signup.html");
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");
    try{
      const email = $("email").value.trim();
      const password = $("password").value;
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await routeByRole(cred.user);
    }catch(err){
      setMsg(err?.message || "Login failed.");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if(user){
      await routeByRole(user);
    }
  });
}

// Signup page
const signupForm = $("signupForm");
if(signupForm){
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");
    try{
      const name = $("name").value.trim();
      const company = $("company").value.trim();
      const email = $("email").value.trim();
      const password = $("password").value;
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Create user profile with default role employee
      await setDoc(doc(db, "users", cred.user.uid), {
        name, company, email,
        role: "employee",
        createdAt: new Date().toISOString()
      });

      location.href = "employee.html";
    }catch(err){
      setMsg(err?.message || "Signup failed.");
    }
  });
}
