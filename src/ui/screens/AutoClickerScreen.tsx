import React, { useState, useEffect, useRef } from 'react';
import { db, type ClickerProfileRecord, type ClickerMarker } from '../../data/db';
import { useAppStore } from '../../state/store';
import {
  Plus,
  Trash2,
  AlertOctagon,
  Play,
  X,
  Edit2,
  Check,
  ChevronDown,
  Info,
} from 'lucide-react';

export const AutoClickerScreen: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  const [profiles, setProfiles] = useState<ClickerProfileRecord[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [activeProfile, setActiveProfile] = useState<ClickerProfileRecord | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showButtonSheet, setShowButtonSheet] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customLabelInput, setCustomLabelInput] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const draggingMarkerId = useRef<string | null>(null);

  // Load profiles from Dexie
  const loadProfiles = async () => {
    let list = await db.clickerProfiles.toArray();
    if (list.length === 0) {
      // Default initial profile
      const defaultProfile: ClickerProfileRecord = {
        id: 'default-profile',
        name: 'My Clicker',
        platform: 'android',
        markers: [
          { id: 'm-1', label: 'Up', x: 0.72, y: 0.15 },
          { id: 'm-2', label: 'Down', x: 0.25, y: 0.78 },
          { id: 'm-3', label: 'Timeframe', x: 0.75, y: 0.75 },
          { id: 'm-4', label: 'Amount', x: 0.25, y: 0.85 },
          { id: 'm-5', label: 'Confirm', x: 0.75, y: 0.85 },
        ],
      };
      await db.clickerProfiles.put(defaultProfile);
      list = [defaultProfile];
    }

    setProfiles(list);
    const current = list.find((p) => p.id === activeProfileId) || list[0];
    setActiveProfileId(current.id);
    setActiveProfile(current);
    setProfileNameInput(current.name);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const saveCurrentProfile = async (updated: ClickerProfileRecord) => {
    await db.clickerProfiles.put(updated);
    setActiveProfile(updated);
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleCreateProfile = async () => {
    const newId = `profile-${Date.now()}`;
    const newProfile: ClickerProfileRecord = {
      id: newId,
      name: `Profile ${profiles.length + 1}`,
      platform: 'android',
      markers: [
        { id: `m-${Date.now()}-1`, label: 'Up', x: 0.5, y: 0.5 },
      ],
    };
    await db.clickerProfiles.put(newProfile);
    await loadProfiles();
    setActiveProfileId(newId);
    setActiveProfile(newProfile);
    setProfileNameInput(newProfile.name);
  };

  const handleDeleteProfile = async (id: string) => {
    await db.clickerProfiles.delete(id);
    setConfirmDeleteId(null);
    await loadProfiles();
  };

  const handleSaveName = async () => {
    if (!activeProfile) return;
    const updated = { ...activeProfile, name: profileNameInput.trim() || 'Untitled' };
    await saveCurrentProfile(updated);
    setIsEditingName(false);
  };

  // Marker dragging
  const handlePointerDown = (markerId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    draggingMarkerId.current = markerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingMarkerId.current || !previewRef.current || !activeProfile) return;

    const rect = previewRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width));
    const y = Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height));

    const updatedMarkers = activeProfile.markers.map((m) =>
      m.id === draggingMarkerId.current ? { ...m, x, y } : m
    );

    setActiveProfile({ ...activeProfile, markers: updatedMarkers });
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (draggingMarkerId.current && activeProfile) {
      await saveCurrentProfile(activeProfile);
      draggingMarkerId.current = null;
    }
  };

  const handleMarkerClick = (markerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMarkerId(markerId);
    setShowButtonSheet(true);
  };

  const handleAddMarker = async () => {
    if (!activeProfile) return;
    const newMarker: ClickerMarker = {
      id: `m-${Date.now()}`,
      label: 'Up',
      x: 0.5,
      y: 0.5,
    };
    const updated = {
      ...activeProfile,
      markers: [...activeProfile.markers, newMarker],
    };
    await saveCurrentProfile(updated);
    setSelectedMarkerId(newMarker.id);
    setShowButtonSheet(true);
  };

  const handleRemoveMarker = async (markerId: string) => {
    if (!activeProfile) return;
    const updated = {
      ...activeProfile,
      markers: activeProfile.markers.filter((m) => m.id !== markerId),
    };
    await saveCurrentProfile(updated);
    setShowButtonSheet(false);
  };

  const handleSetLabel = async (label: string) => {
    if (!activeProfile || !selectedMarkerId) return;
    const updatedMarkers = activeProfile.markers.map((m) =>
      m.id === selectedMarkerId ? { ...m, label } : m
    );
    await saveCurrentProfile({ ...activeProfile, markers: updatedMarkers });
    setShowButtonSheet(false);
  };

  const handleSetCustomLabel = async () => {
    if (!customLabelInput.trim()) return;
    await handleSetLabel(customLabelInput.trim());
    setShowCustomModal(false);
    setCustomLabelInput('');
  };

  const handleEmergencyStop = async () => {
    await updateSettings({ emergencyStopped: true });
  };

  const selectedMarker = activeProfile?.markers.find((m) => m.id === selectedMarkerId);

  return (
    <div className="p-4 space-y-4 pb-20">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">Auto-Clicker Setup</h2>
        <p className="text-xs text-slate-400">Marker mapping and execution triggers</p>
      </div>

      {/* Profile Selector & Management */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-2">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="bg-slate-950 border border-slate-700 px-3 py-1 text-sm rounded-xl text-white w-full focus:outline-none focus:border-cyan-400"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="w-7 h-7 bg-cyan-500 rounded-lg flex items-center justify-center text-slate-950"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white tracking-tight">
                  {activeProfile?.name || 'My Clicker'}
                </span>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-slate-400 hover:text-white"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCreateProfile}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 text-xs"
              title="Create new profile"
            >
              <Plus className="w-4 h-4" />
            </button>

            {profiles.length > 1 && activeProfile && (
              <button
                onClick={() => setConfirmDeleteId(activeProfile.id)}
                className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-rose-400 hover:text-rose-300 text-xs"
                title="Delete profile"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Profile Switcher Tabs */}
        {profiles.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActiveProfileId(p.id);
                  setActiveProfile(p);
                  setProfileNameInput(p.name);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  p.id === activeProfileId
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Target Screen Canvas Preview Area with Numbered Circular Markers */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Screen Mapping Canvas</span>
          <button
            onClick={handleAddMarker}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Marker
          </button>
        </div>

        {/* Phone Preview Area */}
        <div
          ref={previewRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full h-[260px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-inner touch-none select-none"
        >
          {/* Mock app backdrop lines */}
          <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none opacity-40">
            <div className="flex justify-between items-center text-[10px] text-slate-600 font-mono">
              <span>Target app</span>
              <span>—</span>
            </div>
            <div className="h-20 border-b border-dashed border-slate-800 flex items-center justify-center">
              <span className="text-[10px] text-slate-700">Target App Surface (Drag markers to position)</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-6 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-500 flex items-center justify-center">
                BUY
              </div>
              <div className="h-6 rounded bg-rose-500/10 border border-rose-500/20 text-[9px] text-rose-500 flex items-center justify-center">
                SELL
              </div>
            </div>
          </div>

          {/* Numbered Circular Markers */}
          {activeProfile?.markers.map((marker, index) => {
            const leftPercent = `${marker.x * 100}%`;
            const topPercent = `${marker.y * 100}%`;

            return (
              <div
                key={marker.id}
                onPointerDown={(e) => handlePointerDown(marker.id, e)}
                onClick={(e) => handleMarkerClick(marker.id, e)}
                style={{ left: leftPercent, top: topPercent }}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing flex flex-col items-center group z-20"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-500 border-2 border-white shadow-lg flex items-center justify-center text-slate-950 font-extrabold text-xs group-hover:scale-110 active:scale-95 transition-transform">
                  {index + 1}
                </div>
                <span className="mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900/90 text-cyan-300 border border-slate-700 shadow-sm whitespace-nowrap pointer-events-none">
                  {marker.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Emergency Stop & Start Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleEmergencyStop}
          className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-98 transition ${
            settings.emergencyStopped
              ? 'bg-rose-950 border border-rose-800 text-rose-300'
              : 'bg-rose-600 hover:bg-rose-500 text-white'
          }`}
        >
          <AlertOctagon className="w-5 h-5 fill-current" />
          {settings.emergencyStopped ? 'Emergency Stop (Active)' : 'Emergency Stop'}
        </button>

        {settings.emergencyStopped && (
          <div className="text-center">
            <button
              onClick={() => updateSettings({ emergencyStopped: false })}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Reset Safety Stop
            </button>
          </div>
        )}

        {/* Disabled Start Button */}
        <button
          disabled
          className="w-full py-3 px-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-slate-500 font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-80"
        >
          <Play className="w-4 h-4 fill-slate-600" />
          Requires the Android app (next build)
        </button>
      </div>

      {/* "What is this button?" Marker Sheet */}
      {showButtonSheet && selectedMarker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end">
          <div className="absolute inset-0" onClick={() => setShowButtonSheet(false)} />
          <div className="relative bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 max-w-md mx-auto w-full z-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">What is this button?</h3>
                <div className="text-xs text-slate-400">Assign role for Marker</div>
              </div>
              <button
                onClick={() => setShowButtonSheet(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {['Up', 'Down', 'Amount', 'Confirm', 'Timeframe'].map((role) => (
                <button
                  key={role}
                  onClick={() => handleSetLabel(role)}
                  className={`py-3 px-4 rounded-2xl border font-bold text-xs transition ${
                    selectedMarker.label === role
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                      : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {role}
                </button>
              ))}

              <button
                onClick={() => {
                  setShowButtonSheet(false);
                  setShowCustomModal(true);
                }}
                className="py-3 px-4 rounded-2xl border font-bold text-xs bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Custom...
              </button>
            </div>

            {activeProfile && activeProfile.markers.length > 1 && (
              <button
                onClick={() => handleRemoveMarker(selectedMarker.id)}
                className="w-full py-2.5 text-xs text-rose-400 hover:text-rose-300 font-semibold"
              >
                Delete this marker
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom Label Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Custom Marker Label</h3>
            <input
              type="text"
              placeholder="e.g. Turbo, Fast, Cancel"
              value={customLabelInput}
              onChange={(e) => setCustomLabelInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCustomModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSetCustomLabel}
                className="flex-1 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Profile Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Delete Profile?</h3>
            <p className="text-xs text-slate-400">
              Are you sure you want to delete this profile? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProfile(confirmDeleteId)}
                className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
