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
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <input
            className="w-1/2 border p-2 rounded"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose}>Cancel</button>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => {
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

  // FIX 1: Store only the selected incident's ID, not the whole object.
  // This prevents stale data — we always derive the latest snapshot from `incidents`.
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState(null);

  // FIX 2: Derive selectedIncident live from the incidents array so it's never stale.
  const selectedIncident = useMemo(
    () => incidents.find((i) => i.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId]
  );

  /* ================= REALTIME ================= */

  useEffect(() => {
    // FIX 3: Wrap Firestore listeners in try/catch and surface errors to the user.
    try {
      const unsub = onSnapshot(
        collection(db, "incidents"),
        (snap) => {
          setIncidents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setError(null);
        },
        (err) => setError("Firestore (incidents): " + err.message)
      );
      return () => unsub();
    } catch (err) {
      setError("Firebase init failed: " + err.message);
    }
  }, []);

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        collection(db, "resources"),
        (snap) => {
          setResources(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err) => setError("Firestore (resources): " + err.message)
      );
      return () => unsub();
    } catch (err) {
      setError("Firebase init failed: " + err.message);
    }
  }, []);

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        collection(db, "activityLogs"),
        (snap) => {
          setActivityLog(snap.docs.map((d) => d.data()));
        },
        (err) => setError("Firestore (activityLogs): " + err.message)
      );
      return () => unsub();
    } catch (err) {
      setError("Firebase init failed: " + err.message);
    }
  }, []);

  /* ================= HELPERS ================= */

  function getResourceStyle(type) {
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

  function formatTime(ts) {
    if (!ts) return "";
    if (typeof ts === "string") return ts;
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleTimeString();
    return "";
  }

  /* ================= CORE FUNCTIONS ================= */

  async function addIncident(data) {
    try {
      await addDoc(collection(db, "incidents"), {
        ...data,
        status: "active", // FIX 4: Always set an initial status
        assigned: [],
      });

      await addDoc(collection(db, "activityLogs"), {
        text: `New incident reported: ${data.title}`,
        time: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setError("Failed to add incident: " + err.message);
    }
  }

  async function assignResource(name) {
    // FIX 5: Read selectedIncident from the live derived value — never stale.
    if (!selectedIncident) return;

    try {
      const alreadyAssigned = (selectedIncident.assigned || []).includes(name);
      if (alreadyAssigned) return; // guard against double-assignment

      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        assigned: [...(selectedIncident.assigned || []), name],
      });

      const snap = await getDocs(collection(db, "resources"));
      const updates = [];
      snap.forEach((r) => {
        if (r.data().name === name) {
          updates.push(updateDoc(doc(db, "resources", r.id), { status: "Busy" }));
        }
      });
      await Promise.all(updates); // FIX 6: Run resource updates in parallel

      await addDoc(collection(db, "activityLogs"), {
        text: `${name} assigned to ${selectedIncident.title}`,
        time: new Date().toLocaleTimeString(),
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
      await Promise.all(updates); // FIX 6: Run in parallel

      await updateDoc(doc(db, "incidents", selectedIncident.id), {
        status: "completed",
      });

      await addDoc(collection(db, "activityLogs"), {
        text: `${selectedIncident.title} resolved`,
        time: new Date().toLocaleTimeString(),
      });

      setSelectedIncidentId(null);
    } catch (err) {
      setError("Failed to complete incident: " + err.message);
    }
  }

  /* ================= UI ================= */

  // FIX 7: Filter out completed incidents from the sidebar list
  const activeIncidents = incidents.filter((i) => i.status !== "completed");

  return (
    <div className="h-screen flex flex-col bg-gray-100">

      {/* HEADER */}
      <div className="bg-white px-6 py-3 flex justify-between border-b">
        <h1 className="text-lg font-semibold">
          Smart Incident Command Dashboard
        </h1>
        <span className="text-green-600">● Active</span>
      </div>

      {/* FIX 3: Show Firebase errors prominently */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 text-sm">
          ⚠ {error} — Check your Firebase config in <code>firebase.js</code>.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <div className="w-72 bg-white p-4 border-r overflow-y-auto">
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white w-full py-2 rounded-xl mb-4"
          >
            + New Incident
          </button>

          {activeIncidents.map((i) => (
            <div
              key={i.id}
              onClick={() => setSelectedIncidentId(i.id)} // FIX 1: store ID only
              className={`p-3 mb-3 rounded-xl border cursor-pointer ${
                selectedIncidentId === i.id
                  ? "bg-red-50 border-red-300"
                  : "bg-gray-50"
              }`}
            >
              <p className="font-semibold text-sm">
                {i.id} - {i.title}
              </p>

              <p className="text-xs text-gray-500">{i.description}</p>

              <span className={`text-xs px-2 py-1 rounded ${severityStyle(i.severity)}`}>
                {i.severity}
              </span>
            </div>
          ))}
        </div>

        {/* MAIN */}
        <div className="flex-1 p-4 flex flex-col gap-4">

          {/* MAP */}
          <div className="h-[280px] rounded-xl shadow overflow-hidden">
            <MapContainer
              center={[19.24, 72.85]}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {activeIncidents.map((i) =>
                i.lat && i.lng ? (
                  <CircleMarker key={i.id} center={[i.lat, i.lng]} radius={8}>
                    <Popup>{i.title}</Popup>
                  </CircleMarker>
                ) : null
              )}
            </MapContainer>
          </div>

          {/* PANELS */}
          <div className="grid grid-cols-3 gap-5 h-[350px]">

            {/* RESOURCE */}
            <div className="bg-white p-4 rounded-xl border overflow-y-auto">
              <h3 className="font-semibold mb-2">Resources</h3>

              {resources.map((r) => (
                <div
                  key={r.id}
                  onClick={() => r.status === "Available" && assignResource(r.name)}
                  className={`flex justify-between p-2 mb-2 bg-gray-50 rounded ${
                    r.status === "Available"
                      ? "cursor-pointer hover:bg-blue-50"
                      : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <div className="flex gap-2 items-center">
                    {getResourceStyle(r.type)}
                    {r.name}
                  </div>

                  <span className={`text-sm px-2 py-1 rounded ${
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
              <h3 className="font-semibold mb-2">Assignment</h3>

              {selectedIncident ? (
                <>
                  <div className="bg-blue-50 p-2 rounded mb-2 text-sm font-medium">
                    {selectedIncident.title}
                  </div>

                  <p className="text-xs text-gray-400 mb-1">Assigned resources:</p>
                  <div className="flex flex-wrap gap-2">
                    {(selectedIncident.assigned || []).length === 0 ? (
                      <p className="text-xs text-gray-400">None yet — click an available resource.</p>
                    ) : (
                      (selectedIncident.assigned || []).map((a, i) => (
                        <span key={i} className="bg-blue-100 px-2 py-1 rounded text-xs">
                          {a}
                        </span>
                      ))
                    )}
                  </div>

                  <button
                    onClick={completeIncident}
                    className="bg-green-500 text-white mt-3 py-1 rounded"
                  >
                    Mark Complete
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400">Select an incident from the sidebar.</p>
              )}
            </div>

            {/* ACTIVITY */}
            <div className="bg-white p-4 rounded-xl border overflow-y-auto">
              <h3 className="font-semibold mb-2">Activity</h3>

              {activityLog.map((log, i) => (
                <div key={i} className="flex gap-2 mb-3">
                  <div className="w-2 h-2 mt-2 bg-blue-500 rounded-full flex-shrink-0"></div>

                  <div>
                    <p className="text-xs text-gray-400">{formatTime(log.time)}</p>
                    <p className="text-sm">{log.text}</p>
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
