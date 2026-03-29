import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useState, useEffect, useMemo } from "react";
import {
  Flame, Ambulance, Shield, Users,
  X, CheckCircle, Clock, AlertTriangle, LogOut,
} from "lucide-react";

import { db, auth, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, onSnapshot,
  updateDoc, doc, getDocs,
} from "firebase/firestore";

/* ─────────────────────────────────────────
   SEVERITY PRIORITY ORDER (highest = 0)
───────────────────────────────────────── */
const SEVERITY_RANK = { Extreme: 0, High: 1, Medium: 2, Low: 3 };

/* ─────────────────────────────────────────
   LOGIN SCREEN
───────────────────────────────────────── */
function LoginScreen({ onLogin, error }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-100 gap-5">
      <div className="bg-white p-10 rounded-2xl shadow-xl flex flex-col items-center gap-5 w-80">
        {/* Icon */}
        <div className="bg-blue-600 text-white rounded-full p-4">
          <Shield size={32} />
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-800">Incident Command</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to access the dashboard</p>
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg text-center">
            {error}
          </p>
        )}

        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-3 border border-gray-200
                     hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium py-2.5
                     px-4 rounded-xl transition text-sm shadow-sm"
        >
          {/* Google "G" logo inline SVG — no external dependency */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Sign in with Google
        </button>
      </div>

      <p className="text-xs text-gray-400">Semester Project — SICD Dashboard</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   INCIDENT MODAL
───────────────────────────────────────── */
function IncidentModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [lat, setLat] = useState("19.24");
  const [lng, setLng] = useState("72.85");
  const [titleError, setTitleError] = useState(false);

  function handleSubmit() {
    if (!title.trim()) { setTitleError(true); return; }
    onSubmit({ title: title.trim(), description: description.trim(), severity, lat: parseFloat(lat), lng: parseFloat(lng) });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[9999]">
      <div className="bg-white w-[500px] p-6 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">Report New Incident</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title *</label>
        <input
          className={`w-full border p-2 mb-1 mt-1 rounded-lg text-sm ${titleError ? "border-red-400" : ""}`}
          placeholder="e.g. Building fire at Andheri East"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleError(false); }}
        />
        {titleError && <p className="text-xs text-red-500 mb-2">Title is required.</p>}

        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 block">Description</label>
        <textarea
          className="w-full border p-2 mb-3 mt-1 rounded-lg h-20 text-sm"
          placeholder="Brief description of the situation..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</label>
        <select className="w-full border p-2 mb-3 mt-1 rounded-lg text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
          <option>Extreme</option>
        </select>

        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location (Lat / Lng)</label>
        <div className="flex gap-2 mb-5 mt-1">
          <input className="w-1/2 border p-2 rounded-lg text-sm" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="w-1/2 border p-2 rounded-lg text-sm" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 text-sm" onClick={onClose}>Cancel</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition" onClick={handleSubmit}>
            Report Incident
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN APP
───────────────────────────────────────── */
export default function App() {
  // ── Auth state ──
  const [user, setUser] = useState(null);         // null = not signed in
  const [authLoading, setAuthLoading] = useState(true); // waiting for Firebase to restore session
  const [authError, setAuthError] = useState(null);

  // ── Data state ──
  const [incidents, setIncidents] = useState([]);
  const [resources, setResources] = useState([]);
  const [activityLog, setActivityLog] = useState([]);

  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState(null);

  const selectedIncident = useMemo(
    () => incidents.find((i) => i.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId]
  );

  /* ── Auth listener — restores session on page refresh ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  /* ── Firestore listeners — only start AFTER user is signed in ── */
  useEffect(() => {
    if (!user) return; // don't listen when logged out — rules would reject anyway

    const unsubIncidents = onSnapshot(
      collection(db, "incidents"),
      (snap) => { setIncidents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(null); },
      (err) => setError("incidents: " + err.message)
    );

    const unsubResources = onSnapshot(
      collection(db, "resources"),
      (snap) => setResources(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => setError("resources: " + err.message)
    );

    const unsubLogs = onSnapshot(
      collection(db, "activityLogs"),
      (snap) => {
        const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => {
          const ms = (t) => {
            if (!t) return 0;
            if (t?.seconds) return t.seconds * 1000;
            if (typeof t === "string") return new Date(t).getTime();
            return 0;
          };
          return ms(b.time) - ms(a.time);
        });
        setActivityLog(logs);
      },
      (err) => setError("activityLogs: " + err.message)
    );

    return () => { unsubIncidents(); unsubResources(); unsubLogs(); };
  }, [user]); // re-run when auth state changes

  /* ── Auth actions ── */
  async function handleLogin() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will update `user` automatically
    } catch (err) {
      // user closed popup or network error — show friendly message
      if (err.code !== "auth/popup-closed-by-user") {
        setAuthError("Sign-in failed: " + err.message);
      }
    }
  }

  async function handleLogout() {
    await signOut(auth);
    // Reset all local state on logout
    setIncidents([]);
    setResources([]);
    setActivityLog([]);
    setSelectedIncidentId(null);
  }

  /* ── Helpers ── */
  function getResourceIcon(type) {
    if (type === "fire") return <Flame className="text-orange-500" size={18} />;
    if (type === "ambulance") return <Ambulance className="text-blue-500" size={18} />;
    if (type === "police") return <Shield className="text-indigo-500" size={18} />;
    return <Users className="text-green-500" size={18} />;
  }

  function severityStyle(sev) {
    if (sev === "Extreme") return "bg-black text-white";
    if (sev === "High")    return "bg-red-100 text-red-700 font-semibold";
    if (sev === "Medium")  return "bg-yellow-100 text-yellow-700";
    return "bg-green-100 text-green-700";
  }

  function severityDotColor(sev) {
    if (sev === "Extreme") return "#000";
    if (sev === "High")    return "#ef4444";
    if (sev === "Medium")  return "#f59e0b";
    return "#22c55e";
  }

  function severityIcon(sev) {
    if (sev === "Extreme" || sev === "High")
      return <AlertTriangle size={12} className="inline mr-1" />;
    return null;
  }

  function formatTime(ts) {
    if (!ts) return "";
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleTimeString();
    if (typeof ts === "string") { const d = new Date(ts); return isNaN(d) ? ts : d.toLocaleTimeString(); }
    return "";
  }

  function logDotColor(text = "") {
    if (text.includes("reported"))  return "bg-blue-500";
    if (text.includes("assigned"))  return "bg-yellow-500";
    if (text.includes("unassigned")) return "bg-orange-400";
    if (text.includes("resolved"))  return "bg-green-500";
    return "bg-gray-400";
  }

  // Short display name: "Rahul S." from "Rahul Sharma"
  function shortName(displayName) {
    if (!displayName) return "Unknown";
    const parts = displayName.trim().split(" ");
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }

  /* ── Core functions ── */

  async function addIncident(data) {
    try {
      const docRef = await addDoc(collection(db, "incidents"), {
        ...data,
        status: "active",
        assigned: [],
        createdAt: new Date().toISOString(),
        reportedBy: user.displayName,        // store who reported it
        reportedByUid: user.uid,
      });

      await addDoc(collection(db, "activityLogs"), {
        text: `🆕 "${data.title}" reported by ${shortName(user.displayName)}`,
        time: new Date().toISOString(),
        incidentId: docRef.id,
        type: "reported",
        uid: user.uid,
      });
    } catch (err) {
      setError("Failed to add incident: " + err.message);
    }
  }

  async function assignResource(name) {
    if (!selectedIncident) { setError("Select an incident before assigning a resource."); return; }
    if ((selectedIncident.assigned || []).includes(name)) return;

    try {
      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        assigned: [...(selectedIncident.assigned || []), name],
      });

      const snap = await getDocs(collection(db, "resources"));
      await Promise.all(
        snap.docs
          .filter((r) => r.data().name === name)
          .map((r) => updateDoc(doc(db, "resources", r.id), { status: "Busy" }))
      );

      await addDoc(collection(db, "activityLogs"), {
        text: `🚒 ${name} assigned to "${selectedIncident.title}" by ${shortName(user.displayName)}`,
        time: new Date().toISOString(),
        incidentId: selectedIncident.id,
        type: "assigned",
        uid: user.uid,
      });
    } catch (err) {
      setError("Failed to assign resource: " + err.message);
    }
  }

  async function unassignResource(name) {
    if (!selectedIncident) return;

    try {
      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        assigned: (selectedIncident.assigned || []).filter((a) => a !== name),
      });

      const snap = await getDocs(collection(db, "resources"));
      await Promise.all(
        snap.docs
          .filter((r) => r.data().name === name)
          .map((r) => updateDoc(doc(db, "resources", r.id), { status: "Available" }))
      );

      await addDoc(collection(db, "activityLogs"), {
        text: `↩️ ${name} unassigned from "${selectedIncident.title}" by ${shortName(user.displayName)}`,
        time: new Date().toISOString(),
        incidentId: selectedIncident.id,
        type: "unassigned",
        uid: user.uid,
      });
    } catch (err) {
      setError("Failed to unassign resource: " + err.message);
    }
  }

  async function completeIncident() {
    if (!selectedIncident) return;

    try {
      const snap = await getDocs(collection(db, "resources"));
      await Promise.all(
        snap.docs
          .filter((r) => (selectedIncident.assigned || []).includes(r.data().name))
          .map((r) => updateDoc(doc(db, "resources", r.id), { status: "Available" }))
      );

      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        status: "completed",
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.displayName,
      });

      await addDoc(collection(db, "activityLogs"), {
        text: `✅ "${selectedIncident.title}" resolved by ${shortName(user.displayName)}`,
        time: new Date().toISOString(),
        incidentId: selectedIncident.id,
        type: "resolved",
        uid: user.uid,
      });

      setSelectedIncidentId(null);
    } catch (err) {
      setError("Failed to complete incident: " + err.message);
    }
  }

  /* ── Derived state ── */

  // UPGRADE: sort active incidents by severity priority (Extreme first)
  const activeIncidents = useMemo(() => {
    return incidents
      .filter((i) => i.status !== "completed")
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
  }, [incidents]);

  const busyResources = resources.filter((r) => r.status === "Busy").length;

  /* ── Render: loading splash ── */
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  /* ── Render: login screen ── */
  if (!user) {
    return <LoginScreen onLogin={handleLogin} error={authError} />;
  }

  /* ── Render: main dashboard ── */
  return (
    <div className="h-screen flex flex-col bg-gray-100">

      {/* HEADER */}
      <div className="bg-white px-6 py-3 flex justify-between items-center border-b shadow-sm">
        <div>
          <h1 className="text-base font-bold text-gray-800">Smart Incident Command Dashboard</h1>
          <p className="text-xs text-gray-400">Mumbai Metropolitan Region</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Live stats */}
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <AlertTriangle size={13} className="text-red-400" />
              {activeIncidents.length} Active
            </span>
            <span className="flex items-center gap-1">
              <Clock size={13} className="text-yellow-400" />
              {busyResources}/{resources.length} Deployed
            </span>
          </div>

          <span className="text-green-600 text-xs font-semibold flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse" />
            Live
          </span>

          {/* UPGRADE: User avatar + sign-out */}
          <div className="flex items-center gap-2 border-l pl-4 ml-1">
            {user.photoURL && (
              <img src={user.photoURL} alt="avatar" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-xs text-gray-600 font-medium hidden sm:block">
              {shortName(user.displayName)}
            </span>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-gray-400 hover:text-red-500 transition"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-2 text-sm flex justify-between items-center">
          <span>⚠ {error}</span>
          <button className="ml-4 text-red-400 hover:text-red-600" onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR — priority-sorted incidents */}
        <div className="w-72 bg-white p-4 border-r overflow-y-auto flex flex-col gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white w-full py-2 rounded-xl mb-1 transition font-medium text-sm"
          >
            + New Incident
          </button>

          {activeIncidents.length === 0 ? (
            <div className="text-center mt-8">
              <CheckCircle className="mx-auto text-green-400 mb-2" size={28} />
              <p className="text-xs text-gray-400 italic">All clear — no active incidents.</p>
            </div>
          ) : (
            activeIncidents.map((i) => (
              <div
                key={i.id}
                onClick={() => setSelectedIncidentId((prev) => (prev === i.id ? null : i.id))}
                className={`p-3 rounded-xl border cursor-pointer transition ${
                  selectedIncidentId === i.id
                    ? "bg-red-50 border-red-300 shadow-sm"
                    : "bg-gray-50 hover:bg-gray-100 border-transparent"
                }`}
              >
                <p className="font-semibold text-sm truncate">{i.title}</p>
                {/* UPGRADE: show who reported it */}
                {i.reportedBy && (
                  <p className="text-xs text-gray-400 truncate">by {shortName(i.reportedBy)}</p>
                )}
                <p className="text-xs text-gray-500 truncate mb-1">{i.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${severityStyle(i.severity)}`}>
                    {severityIcon(i.severity)}{i.severity}
                  </span>
                  {(i.assigned || []).length > 0 && (
                    <span className="text-xs text-gray-400">{i.assigned.length} assigned</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* MAIN */}
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">

          {/* MAP */}
          <div className="h-[250px] rounded-xl shadow overflow-hidden flex-shrink-0">
            <MapContainer center={[19.24, 72.85]} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              {activeIncidents.map((i) =>
                i.lat && i.lng ? (
                  <CircleMarker
                    key={i.id}
                    center={[i.lat, i.lng]}
                    radius={i.id === selectedIncidentId ? 12 : 8}
                    pathOptions={{
                      color: severityDotColor(i.severity),
                      fillColor: severityDotColor(i.severity),
                      fillOpacity: i.id === selectedIncidentId ? 0.9 : 0.65,
                      weight: i.id === selectedIncidentId ? 3 : 1,
                    }}
                  >
                    <Popup>
                      <strong>{i.title}</strong><br />
                      Severity: {i.severity}<br />
                      {(i.assigned || []).length} resource(s) assigned
                      {i.reportedBy && <><br />Reported by: {i.reportedBy}</>}
                    </Popup>
                  </CircleMarker>
                ) : null
              )}
            </MapContainer>
          </div>

          {/* PANELS */}
          <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">

            {/* RESOURCES */}
            <div className="bg-white p-4 rounded-xl border overflow-y-auto">
              <h3 className="font-bold mb-3 text-xs uppercase tracking-wide text-gray-400">Resources</h3>

              {resources.length === 0 && (
                <p className="text-xs text-gray-400 italic">No resources in Firestore.</p>
              )}

              {resources.map((r) => {
                const isAssignedHere = (selectedIncident?.assigned || []).includes(r.name);
                const isAvailable = r.status === "Available";
                return (
                  <div
                    key={r.id}
                    onClick={() => isAvailable && !isAssignedHere && assignResource(r.name)}
                    title={
                      isAssignedHere ? "Already assigned — unassign from Assignment panel"
                        : isAvailable ? "Click to assign to selected incident"
                        : "Resource currently busy"
                    }
                    className={`flex justify-between items-center p-2 mb-2 rounded-lg transition border ${
                      isAssignedHere   ? "border-blue-200 bg-blue-50 cursor-default"
                      : isAvailable    ? "border-transparent bg-gray-50 cursor-pointer hover:bg-blue-50 hover:border-blue-100"
                      : "border-transparent bg-gray-50 cursor-not-allowed opacity-40"
                    }`}
                  >
                    <div className="flex gap-2 items-center text-sm">
                      {getResourceIcon(r.type)}
                      <span>{r.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      isAssignedHere ? "bg-blue-100 text-blue-600"
                      : isAvailable  ? "bg-green-100 text-green-600"
                      : "bg-orange-100 text-orange-600"
                    }`}>
                      {isAssignedHere ? "Assigned" : r.status}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ASSIGNMENT */}
            <div className="bg-white p-4 rounded-xl border flex flex-col">
              <h3 className="font-bold mb-3 text-xs uppercase tracking-wide text-gray-400">Assignment</h3>

              {selectedIncident ? (
                <div className="flex flex-col flex-1">
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-3">
                    <p className="text-sm font-bold text-blue-800 truncate">{selectedIncident.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${severityStyle(selectedIncident.severity)}`}>
                      {selectedIncident.severity}
                    </span>
                    {selectedIncident.reportedBy && (
                      <p className="text-xs text-blue-500 mt-1">by {selectedIncident.reportedBy}</p>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mb-2 font-medium">
                    Assigned ({(selectedIncident.assigned || []).length}):
                  </p>

                  <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
                    {(selectedIncident.assigned || []).length === 0 ? (
                      <p className="text-xs text-gray-400 italic">None yet — click a resource on the left.</p>
                    ) : (
                      (selectedIncident.assigned || []).map((a, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg">
                          <span className="text-xs text-blue-700 font-medium">{a}</span>
                          <button onClick={() => unassignResource(a)} title={`Unassign ${a}`} className="text-blue-300 hover:text-red-500 transition ml-2">
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={completeIncident}
                    className="bg-green-500 hover:bg-green-600 text-white mt-3 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={15} /> Mark Complete
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  <Users size={28} className="text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400 italic">Select an incident from the sidebar.</p>
                </div>
              )}
            </div>

            {/* ACTIVITY LOG */}
            <div className="bg-white p-4 rounded-xl border overflow-y-auto">
              <h3 className="font-bold mb-3 text-xs uppercase tracking-wide text-gray-400">Activity Log</h3>

              {activityLog.length === 0 && (
                <p className="text-xs text-gray-400 italic">No activity yet.</p>
              )}

              {activityLog.map((log, i) => (
                <div key={log.id || i} className="flex gap-2 mb-3">
                  <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${logDotColor(log.text)}`} />
                  <div>
                    <p className="text-xs text-gray-400">{formatTime(log.time)}</p>
                    <p className="text-sm text-gray-700 leading-snug">{log.text}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {showModal && (
        <IncidentModal onClose={() => setShowModal(false)} onSubmit={addIncident} />
      )}
    </div>
  );
}
