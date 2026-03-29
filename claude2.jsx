import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useState, useEffect, useMemo } from "react";
import { Flame, Ambulance, Shield, Users } from "lucide-react";

import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
} from "firebase/firestore";

/* ================= MODAL ================= */
function IncidentModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [lat, setLat] = useState("19.24");
  const [lng, setLng] = useState("72.85");

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-[9999]">
      <div className="bg-white w-[480px] p-6 rounded-xl shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Report New Incident</h2>

        <input
          className="w-full border p-2 mb-3 rounded"
          placeholder="Incident title"
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="w-full border p-2 mb-3 rounded h-20"
          placeholder="Description"
          onChange={(e) => setDescription(e.target.value)}
        />

        <select
          className="w-full border p-2 mb-3 rounded"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
          <option>Extreme</option>
        </select>

        <div className="flex gap-2 mb-4">
          <input
            className="w-1/2 border p-2 rounded"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <input
            className="w-1/2 border p-2 rounded"
            placeholder="Longitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded border text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => {
              if (!title.trim()) return; // FIX: guard against empty title submission
              onSubmit({
                title,
                description,
                severity,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
              });
              onClose();
            }}
          >
            Report
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= APP ================= */
export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [resources, setResources] = useState([]);
  const [activityLog, setActivityLog] = useState([]);

  // FIX: Store only the ID — derive the full object live so it's never stale
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState(null);

  // Always fresh — recomputed whenever incidents or selectedIncidentId changes
  const selectedIncident = useMemo(
    () => incidents.find((i) => i.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId]
  );

  /* ================= REALTIME LISTENERS ================= */

  useEffect(() => {
    // FIX: onSnapshot error callback catches Firestore permission/connection failures
    const unsub = onSnapshot(
      collection(db, "incidents"),
      (snap) => {
        setIncidents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
      },
      (err) => setError("incidents: " + err.message)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "resources"),
      (snap) => {
        setResources(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => setError("resources: " + err.message)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "activityLogs"),
      (snap) => {
        // FIX: Sort newest-first so the activity log reads top-to-bottom
        const logs = snap.docs.map((d) => d.data());
        logs.sort((a, b) => (a.time < b.time ? 1 : -1));
        setActivityLog(logs);
      },
      (err) => setError("activityLogs: " + err.message)
    );
    return () => unsub();
  }, []);

  /* ================= HELPERS ================= */

  function getResourceIcon(type) {
    if (type === "fire") return <Flame className="text-orange-500" size={18} />;
    if (type === "ambulance") return <Ambulance className="text-blue-500" size={18} />;
    if (type === "police") return <Shield className="text-indigo-500" size={18} />;
    return <Users className="text-green-500" size={18} />;
  }

  function severityStyle(sev) {
    if (sev === "Extreme") return "bg-black text-white";
    if (sev === "High") return "bg-red-100 text-red-600";
    if (sev === "Medium") return "bg-yellow-100 text-yellow-600";
    return "bg-green-100 text-green-600";
  }

  function severityDotColor(sev) {
    if (sev === "Extreme") return "#000";
    if (sev === "High") return "#ef4444";
    if (sev === "Medium") return "#f59e0b";
    return "#22c55e";
  }

  function formatTime(ts) {
    if (!ts) return "";
    if (typeof ts === "string") {
      // Handle both ISO strings and locale time strings
      const d = new Date(ts);
      return isNaN(d) ? ts : d.toLocaleTimeString();
    }
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleTimeString();
    return "";
  }

  /* ================= CORE FUNCTIONS ================= */

  async function addIncident(data) {
    try {
      await addDoc(collection(db, "incidents"), {
        ...data,
        status: "active",   // FIX: always set initial status for filtering
        assigned: [],
        createdAt: new Date().toISOString(),
      });

      await addDoc(collection(db, "activityLogs"), {
        text: `New incident reported: ${data.title}`,
        time: new Date().toISOString(), // FIX: ISO string for reliable sort
      });
    } catch (err) {
      setError("Failed to add incident: " + err.message);
    }
  }

  async function assignResource(name) {
    if (!selectedIncident) {
      setError("Select an incident before assigning a resource.");
      return;
    }

    try {
      // FIX: Prevent double-assigning the same resource
      if ((selectedIncident.assigned || []).includes(name)) return;

      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        assigned: [...(selectedIncident.assigned || []), name],
      });

      // FIX: Collect all resource updates and run them in parallel
      const snap = await getDocs(collection(db, "resources"));
      const updates = [];
      snap.forEach((r) => {
        if (r.data().name === name) {
          updates.push(updateDoc(doc(db, "resources", r.id), { status: "Busy" }));
        }
      });
      await Promise.all(updates);

      await addDoc(collection(db, "activityLogs"), {
        text: `${name} assigned to "${selectedIncident.title}"`,
        time: new Date().toISOString(),
      });
    } catch (err) {
      setError("Failed to assign resource: " + err.message);
    }
  }

  async function completeIncident() {
    if (!selectedIncident) return;

    try {
      const snap = await getDocs(collection(db, "resources"));
      const updates = [];
      snap.forEach((r) => {
        if ((selectedIncident.assigned || []).includes(r.data().name)) {
          updates.push(
            updateDoc(doc(db, "resources", r.id), { status: "Available" })
          );
        }
      });
      await Promise.all(updates);

      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        status: "completed",
      });

      await addDoc(collection(db, "activityLogs"), {
        text: `"${selectedIncident.title}" resolved`,
        time: new Date().toISOString(),
      });

      setSelectedIncidentId(null);
    } catch (err) {
      setError("Failed to complete incident: " + err.message);
    }
  }

  /* ================= DERIVED STATE ================= */

  // FIX: Hide completed incidents from sidebar and map
  const activeIncidents = incidents.filter((i) => i.status !== "completed");

  /* ================= UI ================= */

  return (
    <div className="h-screen flex flex-col bg-gray-100">

      {/* HEADER */}
      <div className="bg-white px-6 py-3 flex justify-between items-center border-b">
        <h1 className="text-lg font-semibold">Smart Incident Command Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{activeIncidents.length} active</span>
          <span className="text-green-600 text-sm font-medium">● Live</span>
        </div>
      </div>

      {/* FIX: Firebase error banner with dismiss */}
      {error && (
        <div className="bg-red-100 border-b border-red-300 text-red-700 px-4 py-2 text-sm flex justify-between items-center">
          <span>⚠ Firebase error — {error}</span>
          <button
            className="ml-4 text-red-500 hover:text-red-700 font-bold"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <div className="w-72 bg-white p-4 border-r overflow-y-auto flex flex-col gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white w-full py-2 rounded-xl mb-2 transition"
          >
            + New Incident
          </button>

          {activeIncidents.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-6 italic">
              No active incidents.
            </p>
          )}

          {activeIncidents.map((i) => (
            <div
              key={i.id}
              onClick={() => setSelectedIncidentId(i.id)}
              className={`p-3 rounded-xl border cursor-pointer transition ${
                selectedIncidentId === i.id
                  ? "bg-red-50 border-red-300"
                  : "bg-gray-50 hover:bg-gray-100 border-transparent"
              }`}
            >
              <p className="font-semibold text-sm truncate">{i.title}</p>
              <p className="text-xs text-gray-500 truncate mb-1">{i.description}</p>
              <span className={`text-xs px-2 py-0.5 rounded ${severityStyle(i.severity)}`}>
                {i.severity}
              </span>
            </div>
          ))}
        </div>

        {/* MAIN */}
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">

          {/* MAP */}
          <div className="h-[260px] rounded-xl shadow overflow-hidden flex-shrink-0">
            <MapContainer
              center={[19.24, 72.85]}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              {activeIncidents.map((i) =>
                i.lat && i.lng ? (
                  <CircleMarker
                    key={i.id}
                    center={[i.lat, i.lng]}
                    radius={8}
                    pathOptions={{
                      color: severityDotColor(i.severity),
                      fillColor: severityDotColor(i.severity),
                      fillOpacity: 0.75,
                    }}
                  >
                    <Popup>
                      <strong>{i.title}</strong><br />
                      Severity: {i.severity}
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
              <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide text-gray-400">
                Resources
              </h3>

              {resources.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  No resources in Firestore.
                </p>
              )}

              {resources.map((r) => (
                <div
                  key={r.id}
                  onClick={() => r.status === "Available" && assignResource(r.name)}
                  title={
                    r.status === "Available"
                      ? "Click to assign to selected incident"
                      : "Resource currently busy"
                  }
                  className={`flex justify-between items-center p-2 mb-2 rounded transition ${
                    r.status === "Available"
                      ? "bg-gray-50 cursor-pointer hover:bg-blue-50"
                      : "bg-gray-50 cursor-not-allowed opacity-50"
                  }`}
                >
                  <div className="flex gap-2 items-center text-sm">
                    {getResourceIcon(r.type)}
                    <span>{r.name}</span>
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    r.status === "Available"
                      ? "bg-green-100 text-green-600"
                      : "bg-orange-100 text-orange-600"
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>

            {/* ASSIGNMENT */}
            <div className="bg-white p-4 rounded-xl border flex flex-col">
              <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide text-gray-400">
                Assignment
              </h3>

              {selectedIncident ? (
                <div className="flex flex-col flex-1">
                  <div className="bg-blue-50 border border-blue-200 p-2 rounded mb-3">
                    <p className="text-sm font-semibold text-blue-800 truncate">
                      {selectedIncident.title}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded ${severityStyle(selectedIncident.severity)}`}>
                      {selectedIncident.severity}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mb-2">Assigned resources:</p>

                  <div className="flex flex-wrap gap-2 flex-1 content-start">
                    {(selectedIncident.assigned || []).length === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        None yet — click an available resource to assign.
                      </p>
                    ) : (
                      (selectedIncident.assigned || []).map((a, idx) => (
                        <span
                          key={idx}
                          className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"
                        >
                          {a}
                        </span>
                      ))
                    )}
                  </div>

                  <button
                    onClick={completeIncident}
                    className="bg-green-500 hover:bg-green-600 text-white mt-3 py-2 rounded text-sm font-medium transition"
                  >
                    ✓ Mark Complete
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Select an incident from the sidebar.
                </p>
              )}
            </div>

            {/* ACTIVITY */}
            <div className="bg-white p-4 rounded-xl border overflow-y-auto">
              <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide text-gray-400">
                Activity Log
              </h3>

              {activityLog.length === 0 && (
                <p className="text-xs text-gray-400 italic">No activity yet.</p>
              )}

              {activityLog.map((log, i) => (
                <div key={i} className="flex gap-2 mb-3">
                  <div className="w-2 h-2 mt-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">{formatTime(log.time)}</p>
                    <p className="text-sm text-gray-700">{log.text}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {showModal && (
        <IncidentModal
          onClose={() => setShowModal(false)}
          onSubmit={addIncident}
        />
      )}
    </div>
  );
}
