import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { appConfig } from "./config.js";

const rtcConfig = {
  iceServers: resolveIceServers(),
};

const roomAlphabet = "bcdfghjklmnpqrstvwxyz";
const localUserStorageKey = "otomeh-chat:local-user";
const generatedConversationStorageKey = "otomeh-chat:generated-room";

const state = {
  supabase: null,
  user: null,
  currentRoom: null,
  channel: null,
  selfPeerId: null,
  localStream: null,
  cameraStream: null,
  screenStream: null,
  peers: new Map(),
  participants: new Map(),
  toastTimer: null,
  micEnabled: true,
  cameraEnabled: true,
  screenSharing: false,
  restoreCameraEnabled: true,
  authReady: false,
};

const elements = {
  landingView: document.getElementById("landing-view"),
  roomView: document.getElementById("room-view"),
  configBanner: document.getElementById("config-banner"),
  sessionPill: document.getElementById("session-pill"),
  sessionEmail: document.getElementById("session-email"),
  signOutButton: document.getElementById("sign-out-button"),
  authPanel: document.getElementById("auth-panel"),
  linkPanel: document.getElementById("link-panel"),
  authForm: document.getElementById("auth-form"),
  authUsername: document.getElementById("auth-username"),
  authFeedback: document.getElementById("auth-feedback"),
  authSubmit: document.getElementById("auth-submit"),
  myRoomCode: document.getElementById("my-room-code"),
  myRoomLinkPreview: document.getElementById("my-room-link-preview"),
  newRoomButton: document.getElementById("new-room-button"),
  copyHomeLinkButton: document.getElementById("copy-home-link-button"),
  roomTitle: document.getElementById("room-title"),
  roomGate: document.getElementById("room-gate"),
  videoGrid: document.getElementById("video-grid"),
  participantList: document.getElementById("participant-list"),
  participantCount: document.getElementById("participant-count"),
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  copyRoomLinkButton: document.getElementById("copy-room-link-button"),
  leaveRoomButton: document.getElementById("leave-room-button"),
  copyRoomCodeButton: document.getElementById("copy-room-code-button"),
  leaveRoomDockButton: document.getElementById("leave-room-dock-button"),
  toggleMicButton: document.getElementById("toggle-mic-button"),
  toggleMicLabel: document.getElementById("toggle-mic-label"),
  toggleCameraButton: document.getElementById("toggle-camera-button"),
  toggleCameraLabel: document.getElementById("toggle-camera-label"),
  toggleShareButton: document.getElementById("toggle-share-button"),
  toggleShareLabel: document.getElementById("toggle-share-label"),
  toast: document.getElementById("toast"),
  videoTileTemplate: document.getElementById("video-tile-template"),
  participantTemplate: document.getElementById("participant-template"),
  chatMessageTemplate: document.getElementById("chat-message-template"),
};

const isSupabaseConfigured =
  appConfig.supabaseUrl &&
  appConfig.supabaseAnonKey &&
  !appConfig.supabaseUrl.includes("YOUR_") &&
  !appConfig.supabaseAnonKey.includes("YOUR_");
const hasPublicBaseUrl = Boolean(normalizeBaseUrl(appConfig.publicBaseUrl));
const hasTurnServer = rtcConfig.iceServers.some((server) =>
  [server.urls].flat().some((url) => typeof url === "string" && url.startsWith("turn:")),
);

function resolveIceServers() {
  if (Array.isArray(appConfig.iceServers) && appConfig.iceServers.length > 0) {
    return appConfig.iceServers;
  }

  return [{ urls: ["stun:stun.l.google.com:19302"] }];
}

bootstrap().catch((error) => {
  console.error(error);
  showToast("The app failed to initialize. Check the console for details.");
});

async function bootstrap() {
  bindEvents();

  if (isLocalOrigin() && !hasPublicBaseUrl) {
    elements.configBanner.textContent =
      "Shared links from localhost only work on your device. Set publicBaseUrl in config.js to your GitHub Pages URL.";
    elements.configBanner.classList.remove("hidden");
  } else if (!hasTurnServer) {
    elements.configBanner.textContent =
      "Add a TURN server in config.js for reliable cross-network audio and video.";
    elements.configBanner.classList.remove("hidden");
  }

  if (isSupabaseConfigured) {
    state.supabase = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }

  restoreStoredUser();
  state.authReady = true;
  renderRoute();
}

function bindEvents() {
  window.addEventListener("popstate", () => {
    renderRoute();
  });

  elements.authForm.addEventListener("submit", handleUsernameAuth);
  elements.newRoomButton.addEventListener("click", () => {
    if (!state.user) {
      showToast("Choose a username before opening a conversation.");
      elements.authUsername.focus();
      return;
    }

    goToRoom(ensureGeneratedConversationCode());
  });

  elements.copyHomeLinkButton.addEventListener("click", async () => {
    if (!state.user) {
      showToast("Choose a username first.");
      return;
    }

    warnAboutLocalShareLink();
    await copyText(
      getRoomLink(ensureGeneratedConversationCode()),
      "Your conversation link was copied.",
    );
  });

  elements.signOutButton.addEventListener("click", async () => {
    await disconnectRoom();
    clearStoredUser();
    applyUser(null);
    renderRoute();
    showToast("Signed out.");
  });

  elements.copyRoomLinkButton.addEventListener("click", async () => {
    if (!state.currentRoom) {
      return;
    }

    warnAboutLocalShareLink();
    await copyText(getRoomLink(state.currentRoom), "Conversation link copied.");
  });

  elements.copyRoomCodeButton.addEventListener("click", async () => {
    if (!state.currentRoom) {
      return;
    }

    await copyText(state.currentRoom, "Conversation code copied.");
  });

  elements.leaveRoomButton.addEventListener("click", leaveCurrentRoom);
  elements.leaveRoomDockButton.addEventListener("click", leaveCurrentRoom);
  elements.toggleMicButton.addEventListener("click", () => toggleTrack("audio"));
  elements.toggleCameraButton.addEventListener("click", () => toggleTrack("video"));
  elements.toggleShareButton.addEventListener("click", () => {
    toggleScreenShare().catch((error) => {
      console.error(error);
      showToast("Screen sharing could not start.");
    });
  });

  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const value = elements.chatInput.value.trim();
    if (!value || !state.user) {
      return;
    }

    if (!state.channel) {
      showToast("Conversation messages are unavailable right now.");
      return;
    }

    appendChatMessage({
      author: currentDisplayName(),
      body: value,
      sentAt: new Date().toISOString(),
      isSelf: true,
    });

    elements.chatInput.value = "";

    await state.channel.send({
      type: "broadcast",
      event: "chat",
      payload: {
        from: state.selfPeerId,
        body: value,
        author: currentDisplayName(),
        sentAt: new Date().toISOString(),
      },
    });
  });
}

async function handleUsernameAuth(event) {
  event.preventDefault();

  const username = sanitizeUsername(elements.authUsername.value);
  if (!isValidUsername(username)) {
    showToast("Choose a username with at least 3 characters.");
    return;
  }

  const nextUser = createLocalUser(username);
  persistUser(nextUser);
  applyUser(nextUser);

  if (!getRoomFromUrl()) {
    issueFreshConversationCode();
    refreshSignedInProfile();
  }

  elements.authFeedback.textContent =
    "Your conversation link is ready below.";
  renderRoute();
  showToast("Username saved.");
}

function applyUser(user) {
  state.user = user;
  updateAuthPanels();

  if (!state.user) {
    state.currentRoom = null;
    elements.authUsername.value = "";
    elements.myRoomCode.textContent = "---";
    elements.myRoomLinkPreview.textContent = "Open your conversation link";
    elements.myRoomLinkPreview.href = "./";
  } else {
    refreshSignedInProfile();
  }
}

function updateAuthPanels() {
  const isSignedIn = Boolean(state.user);
  elements.sessionPill.classList.toggle("hidden", !isSignedIn);
  elements.signOutButton.classList.toggle("hidden", !isSignedIn);
  elements.authPanel.classList.toggle("hidden", isSignedIn);
  elements.linkPanel.classList.toggle("hidden", !isSignedIn);

  if (state.user) {
    elements.sessionEmail.textContent = `@${state.user.username}`;
  } else {
    elements.sessionEmail.textContent = "";
  }
}

function refreshSignedInProfile() {
  if (!state.user) {
    return;
  }

  updateGeneratedLinkPanel();
}

function currentDisplayName() {
  if (!state.user) {
    return "Guest";
  }

  return state.user.username;
}

function normalizeBaseUrl(value = "") {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function sanitizeUsername(value = "") {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 _.-]/g, "")
    .trim()
    .slice(0, 24);
}

function normalizeUsername(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isValidUsername(value) {
  return normalizeUsername(value).length >= 3;
}

function isLocalOrigin() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function warnAboutLocalShareLink() {
  if (isLocalOrigin() && !hasPublicBaseUrl) {
    showToast("This link uses localhost. Set publicBaseUrl in config.js before sharing it.");
  }
}

function createLocalUser(username) {
  const cleaned = sanitizeUsername(username);
  return {
    id: crypto.randomUUID(),
    username: cleaned,
  };
}

function persistUser(user) {
  localStorage.setItem(localUserStorageKey, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(localUserStorageKey);
  clearGeneratedConversationCode();
}

function restoreStoredUser() {
  try {
    const raw = localStorage.getItem(localUserStorageKey);
    if (!raw) {
      applyUser(null);
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.username || !isValidUsername(parsed.username)) {
      clearStoredUser();
      applyUser(null);
      return;
    }

    applyUser({
      id: parsed.id || crypto.randomUUID(),
      username: sanitizeUsername(parsed.username),
    });
  } catch (error) {
    console.error(error);
    clearStoredUser();
    applyUser(null);
  }
}

function getGeneratedConversationCode() {
  return normalizeRoomCode(localStorage.getItem(generatedConversationStorageKey) ?? "");
}

function issueFreshConversationCode() {
  const roomCode = generateRoomCode();
  localStorage.setItem(generatedConversationStorageKey, roomCode);
  return roomCode;
}

function ensureGeneratedConversationCode() {
  return getGeneratedConversationCode() || issueFreshConversationCode();
}

function clearGeneratedConversationCode() {
  localStorage.removeItem(generatedConversationStorageKey);
}

function updateGeneratedLinkPanel() {
  const roomCode = ensureGeneratedConversationCode();
  const roomLink = getRoomLink(roomCode);
  elements.myRoomCode.textContent = roomCode;
  elements.myRoomLinkPreview.textContent = roomLink;
  elements.myRoomLinkPreview.href = roomLink;
}

function renderRoute() {
  const roomCode = getRoomFromUrl();
  const canRenderRoom = Boolean(roomCode && state.user && state.authReady);

  elements.landingView.classList.toggle("hidden", canRenderRoom);
  elements.roomView.classList.toggle("hidden", !canRenderRoom);

  if (!canRenderRoom) {
    if (roomCode && !state.user) {
      elements.authFeedback.textContent = `Choose a username to open conversation ${roomCode}.`;
    }

    disconnectRoom().catch((error) => console.error(error));
    return;
  }

  elements.roomTitle.textContent = roomCode ?? "---";
  elements.roomGate.classList.toggle("hidden", Boolean(state.user));

  if (!roomCode) {
    return;
  }

  if (!state.user || !state.authReady) {
    return;
  }

  if (state.currentRoom === roomCode) {
    return;
  }

  connectToRoom(roomCode).catch((error) => {
    console.error(error);
    showToast("Failed to join the conversation.");
  });
}

function getRoomFromUrl() {
  const url = new URL(window.location.href);
  return normalizeRoomCode(url.searchParams.get("room") ?? "");
}

function goToRoom(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.pushState({}, "", url);
  renderRoute();
}

function leaveCurrentRoom() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.pushState({}, "", url);
  renderRoute();
}

async function connectToRoom(roomCode) {
  await disconnectRoom();

  state.currentRoom = roomCode;
  state.selfPeerId = crypto.randomUUID();
  state.participants.set(state.selfPeerId, localParticipantRecord());
  clearChat();
  resetVideoGrid();
  renderParticipants();

  await ensureLocalStream();
  upsertTile({
    participant: localParticipantRecord(),
    stream: state.localStream,
    isLocal: true,
  });

  appendChatMessage({
    author: "System",
    body: `You joined conversation ${roomCode}.`,
    sentAt: new Date().toISOString(),
    isSelf: false,
  });

  if (!state.supabase) {
    appendChatMessage({
      author: "System",
      body: "This conversation is open in local preview mode.",
      sentAt: new Date().toISOString(),
      isSelf: false,
    });
    showToast("Live conversation is unavailable right now.");
    return;
  }

  const channel = state.supabase.channel(`room:${roomCode}`, {
    config: {
      broadcast: { self: false },
      presence: { key: state.selfPeerId },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      handlePresenceSync(channel);
    })
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      handleSignal(payload).catch((error) => console.error(error));
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => {
      appendChatMessage({
        author: payload.author,
        body: payload.body,
        sentAt: payload.sentAt,
        isSelf: false,
      });
    });

  await new Promise((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        state.channel = channel;
        await updatePresence();
        resolve();
      }

      if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        reject(new Error(`Channel status: ${status}`));
      }
    });
  });
}

async function disconnectRoom() {
  if (state.channel) {
    try {
      await state.channel.unsubscribe();
    } catch (error) {
      console.error(error);
    }
  }

  state.channel = null;
  state.currentRoom = null;
  state.selfPeerId = null;
  state.participants.clear();

  for (const peer of state.peers.values()) {
    peer.pc.close();
  }

  state.peers.clear();
  stopLocalStream();
  resetVideoGrid();
  renderParticipants();
  clearChat();
}

function stopLocalStream() {
  const streams = [state.localStream, state.cameraStream, state.screenStream].filter(Boolean);
  const stoppedTracks = new Set();

  for (const stream of streams) {
    for (const track of stream.getTracks()) {
      if (!stoppedTracks.has(track)) {
        track.stop();
        stoppedTracks.add(track);
      }
    }
  }

  state.localStream = null;
  state.cameraStream = null;
  state.screenStream = null;
  state.micEnabled = true;
  state.cameraEnabled = true;
  state.screenSharing = false;
  state.restoreCameraEnabled = true;
  syncControlState();
}

async function ensureLocalStream() {
  if (state.localStream) {
    return state.localStream;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    state.micEnabled = Boolean(state.cameraStream.getAudioTracks()[0]?.enabled ?? true);
    state.cameraEnabled = Boolean(state.cameraStream.getVideoTracks()[0]?.enabled ?? true);
  } catch (error) {
    console.error(error);
    showToast("Camera or microphone access was denied. You can still join muted.");
    state.cameraStream = new MediaStream();
    state.micEnabled = false;
    state.cameraEnabled = false;
  }

  state.localStream = buildLocalStream();
  syncControlState();
  return state.localStream;
}

function buildLocalStream(overrideVideoTrack = null) {
  const stream = new MediaStream();
  const audioTrack = state.cameraStream?.getAudioTracks()[0] ?? null;
  const videoTrack = overrideVideoTrack ?? getCameraTrack();

  if (audioTrack) {
    stream.addTrack(audioTrack);
  }

  if (videoTrack) {
    stream.addTrack(videoTrack);
  }

  return stream;
}

function getCameraTrack() {
  return state.cameraStream?.getVideoTracks()[0] ?? null;
}

function getCurrentVideoTrack() {
  return state.screenSharing
    ? state.screenStream?.getVideoTracks()[0] ?? null
    : getCameraTrack();
}

async function replaceOutgoingTrack(kind, nextTrack) {
  for (const peer of state.peers.values()) {
    const sender = peer.pc
      .getSenders()
      .find((item) => item.track?.kind === kind);

    if (sender) {
      await sender.replaceTrack(nextTrack ?? null);
    }
  }
}

async function refreshLocalPresenceAndTile() {
  state.participants.set(state.selfPeerId, localParticipantRecord());
  upsertTile({
    participant: localParticipantRecord(),
    stream: state.localStream,
    isLocal: true,
  });
  renderParticipants();
  await updatePresence();
}

async function toggleScreenShare() {
  if (state.screenSharing) {
    await stopScreenShare();
    showToast("Screen sharing stopped.");
    return;
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast("Screen sharing is not supported in this browser.");
    return;
  }

  await ensureLocalStream();

  try {
    state.restoreCameraEnabled = state.cameraEnabled;
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
  } catch (error) {
    if (error?.name !== "NotAllowedError") {
      console.error(error);
    }
    return;
  }

  const screenTrack = state.screenStream.getVideoTracks()[0];
  if (!screenTrack) {
    showToast("No screen track was captured.");
    return;
  }

  screenTrack.addEventListener("ended", () => {
    if (state.screenSharing) {
      stopScreenShare().catch((error) => console.error(error));
    }
  });

  state.screenSharing = true;
  state.cameraEnabled = true;
  state.localStream = buildLocalStream(screenTrack);
  await replaceOutgoingTrack("video", screenTrack);
  syncControlState();
  await refreshLocalPresenceAndTile();
  showToast("Screen sharing started.");
}

async function stopScreenShare() {
  const cameraTrack = getCameraTrack();

  if (state.screenStream) {
    for (const track of state.screenStream.getTracks()) {
      track.stop();
    }
  }

  state.screenStream = null;
  state.screenSharing = false;

  if (cameraTrack) {
    cameraTrack.enabled = state.restoreCameraEnabled;
  }

  state.cameraEnabled = Boolean(cameraTrack?.enabled);
  state.localStream = buildLocalStream();
  await replaceOutgoingTrack("video", cameraTrack ?? null);
  syncControlState();
  await refreshLocalPresenceAndTile();
}

async function updatePresence() {
  if (!state.channel || !state.user) {
    return;
  }

  await state.channel.track(localParticipantRecord());
}

function localParticipantRecord() {
  return {
    peerId: state.selfPeerId,
    userId: state.user?.id ?? "anonymous",
    name: currentDisplayName(),
    handle: state.user?.username ? `@${state.user.username}` : "@guest",
    initials: initials(currentDisplayName()),
    audioEnabled: state.micEnabled,
    videoEnabled: state.cameraEnabled,
    screenSharing: state.screenSharing,
    joinedAt: new Date().toISOString(),
  };
}

function handlePresenceSync(channel) {
  const nextParticipants = new Map();
  const nextPeerIds = new Set();
  const presenceState = channel.presenceState();

  for (const metaGroup of Object.values(presenceState)) {
    const latest = metaGroup.at(-1);
    if (!latest?.peerId) {
      continue;
    }

    nextPeerIds.add(latest.peerId);
    nextParticipants.set(latest.peerId, latest);
  }

  for (const existingPeerId of state.participants.keys()) {
    if (!nextPeerIds.has(existingPeerId) && existingPeerId !== state.selfPeerId) {
      const departingParticipant = state.participants.get(existingPeerId);
      removePeer(existingPeerId);
      appendChatMessage({
        author: "System",
        body: `${departingParticipant?.name ?? "A participant"} left the conversation.`,
        sentAt: new Date().toISOString(),
        isSelf: false,
      });
    }
  }

  for (const [peerId, participant] of nextParticipants.entries()) {
    const previous = state.participants.get(peerId);
    const firstSeen = !previous;
    state.participants.set(peerId, participant);

    if (peerId === state.selfPeerId) {
      upsertTile({
        participant: localParticipantRecord(),
        stream: state.localStream,
        isLocal: true,
      });
      continue;
    }

    upsertTile({
      participant,
      stream: state.peers.get(peerId)?.remoteStream ?? null,
      isLocal: false,
    });

    if (!state.peers.has(peerId) && state.selfPeerId < peerId) {
      createPeerConnection(peerId);
      createOffer(peerId).catch((error) => console.error(error));
    }

    if (firstSeen) {
      appendChatMessage({
        author: "System",
        body: `${participant.name} joined the conversation.`,
        sentAt: new Date().toISOString(),
        isSelf: false,
      });
    }
  }

  renderParticipants();
}

function createPeerConnection(peerId) {
  if (state.peers.has(peerId)) {
    return state.peers.get(peerId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  const remoteStream = new MediaStream();
  const peerRecord = {
    pc,
    remoteStream,
    pendingCandidates: [],
  };

  state.peers.set(peerId, peerRecord);

  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      pc.addTrack(track, state.localStream);
    }
  }

  pc.ontrack = (event) => {
    for (const track of event.streams[0].getTracks()) {
      if (!remoteStream.getTracks().find((item) => item.id === track.id)) {
        remoteStream.addTrack(track);
      }
    }

    upsertTile({
      participant: state.participants.get(peerId),
      stream: remoteStream,
      isLocal: false,
    });
  };

  pc.onicecandidate = async (event) => {
    if (!event.candidate || !state.channel) {
      return;
    }

    await state.channel.send({
      type: "broadcast",
      event: "signal",
      payload: {
        to: peerId,
        from: state.selfPeerId,
        candidate: event.candidate.toJSON(),
      },
    });
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      upsertTile({
        participant: state.participants.get(peerId),
        stream: remoteStream,
        isLocal: false,
      });
    }
  };

  return peerRecord;
}

async function createOffer(peerId) {
  const peer = createPeerConnection(peerId);
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);

  await state.channel.send({
    type: "broadcast",
    event: "signal",
    payload: {
      to: peerId,
      from: state.selfPeerId,
      description: peer.pc.localDescription.toJSON(),
    },
  });
}

async function handleSignal(payload) {
  if (!payload || payload.to !== state.selfPeerId) {
    return;
  }

  const peerId = payload.from;
  const peer = createPeerConnection(peerId);

  if (payload.description) {
    await peer.pc.setRemoteDescription(payload.description);

    while (peer.pendingCandidates.length) {
      const nextCandidate = peer.pendingCandidates.shift();
      await peer.pc.addIceCandidate(nextCandidate);
    }

    if (payload.description.type === "offer") {
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      await state.channel.send({
        type: "broadcast",
        event: "signal",
        payload: {
          to: peerId,
          from: state.selfPeerId,
          description: peer.pc.localDescription.toJSON(),
        },
      });
    }

    return;
  }

  if (payload.candidate) {
    const candidate = new RTCIceCandidate(payload.candidate);
    if (peer.pc.remoteDescription) {
      await peer.pc.addIceCandidate(candidate);
    } else {
      peer.pendingCandidates.push(candidate);
    }
  }
}

function removePeer(peerId) {
  const peer = state.peers.get(peerId);
  if (peer) {
    peer.pc.close();
    state.peers.delete(peerId);
  }

  state.participants.delete(peerId);
  const tile = elements.videoGrid.querySelector(`[data-peer-id="${peerId}"]`);
  tile?.remove();
  renderParticipants();
}

function resetVideoGrid() {
  elements.videoGrid.innerHTML = "";
}

function upsertTile({ participant, stream, isLocal }) {
  if (!participant) {
    return;
  }

  const peerId = participant.peerId;
  let tile = elements.videoGrid.querySelector(`[data-peer-id="${peerId}"]`);

  if (!tile) {
    const fragment = elements.videoTileTemplate.content.cloneNode(true);
    tile = fragment.querySelector(".video-tile");
    tile.dataset.peerId = peerId;
    elements.videoGrid.append(fragment);
    tile = elements.videoGrid.querySelector(`[data-peer-id="${peerId}"]`);
  }

  tile.classList.toggle("remote", !isLocal);
  tile.classList.toggle("is-local", isLocal);
  tile.classList.toggle("is-presenting", Boolean(participant.screenSharing));
  tile.classList.toggle("is-screen-share", Boolean(participant.screenSharing));

  const video = tile.querySelector("video");
  const avatar = tile.querySelector(".video-avatar");
  const name = tile.querySelector(".video-name");
  const status = tile.querySelector(".video-status");
  const role = tile.querySelector(".video-role");

  name.textContent = participant.name + (isLocal ? " (You)" : "");
  role.textContent = participant.screenSharing ? "Screen live" : isLocal ? "Local" : "Guest";
  status.textContent = [
    participant.audioEnabled ? "Mic on" : "Mic off",
    participant.screenSharing
      ? "Screen share live"
      : participant.videoEnabled
        ? "Camera on"
        : "Camera off",
  ].join(" | ");

  avatar.textContent = participant.initials || initials(participant.name);

  const hasEnabledVideoTrack = Boolean(stream?.getVideoTracks().find((track) => track.enabled));
  const hasMediaTracks = Boolean(
    stream && (stream.getVideoTracks().length > 0 || stream.getAudioTracks().length > 0),
  );

  tile.classList.toggle("is-audio-only", hasMediaTracks && !hasEnabledVideoTrack);
  avatar.classList.toggle("hidden", hasEnabledVideoTrack);
  video.classList.toggle("hidden", !hasMediaTracks);
  video.muted = isLocal;
  video.autoplay = true;
  video.playsInline = true;

  if (stream && hasMediaTracks && video.srcObject !== stream) {
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        console.error(error);
      });
    }
  }

  if (!hasMediaTracks) {
    video.srcObject = null;
  }
}

function refreshAllTiles() {
  for (const participant of state.participants.values()) {
    const isLocal = participant.peerId === state.selfPeerId;
    const stream = isLocal ? state.localStream : state.peers.get(participant.peerId)?.remoteStream ?? null;
    upsertTile({ participant, stream, isLocal });
  }
}

function renderParticipants() {
  const participants = Array.from(state.participants.values()).sort((left, right) => {
    if (left.peerId === state.selfPeerId) {
      return -1;
    }

    if (right.peerId === state.selfPeerId) {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });

  elements.participantCount.textContent = String(participants.length);
  elements.participantList.innerHTML = "";

  for (const participant of participants) {
    const fragment = elements.participantTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".participant-item");
    const avatar = item.querySelector(".participant-avatar");
    const name = item.querySelector(".participant-name");
    const email = item.querySelector(".participant-email");
    const flags = item.querySelector(".participant-flags");

    avatar.textContent = participant.initials || initials(participant.name);
    name.textContent =
      participant.name + (participant.peerId === state.selfPeerId ? " (You)" : "");
    email.textContent = participant.handle || "@guest";
    flags.textContent = `${participant.audioEnabled ? "Mic" : "Muted"} / ${
      participant.screenSharing ? "Screen" : participant.videoEnabled ? "Cam" : "No cam"
    }`;

    elements.participantList.append(fragment);
  }
}

function appendChatMessage({ author, body, sentAt, isSelf }) {
  const emptyState = elements.chatLog.querySelector(".empty-state");
  emptyState?.remove();

  const fragment = elements.chatMessageTemplate.content.cloneNode(true);
  const node = fragment.querySelector(".chat-message");
  node.querySelector(".chat-author").textContent = author + (isSelf ? " (You)" : "");
  node.querySelector(".chat-time").textContent = new Date(sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  node.querySelector(".chat-body").textContent = body;
  elements.chatLog.append(fragment);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function clearChat() {
  elements.chatLog.innerHTML = '<div class="empty-state">Conversation messages will appear here.</div>';
}

async function toggleTrack(kind) {
  if (!state.localStream) {
    return;
  }

  if (kind === "video" && state.screenSharing) {
    showToast("Stop screen sharing before changing the camera.");
    return;
  }

  const tracks =
    kind === "audio"
      ? state.cameraStream?.getAudioTracks() ?? []
      : getCameraTrack()
        ? [getCameraTrack()]
        : [];
  if (!tracks.length) {
    showToast(`No ${kind === "audio" ? "microphone" : "camera"} track is available.`);
    return;
  }

  const nextEnabled = !(tracks[0]?.enabled ?? false);

  for (const track of tracks) {
    track.enabled = nextEnabled;
  }

  if (kind === "audio") {
    state.micEnabled = nextEnabled;
  } else {
    state.cameraEnabled = nextEnabled;
    state.localStream = buildLocalStream();
    await replaceOutgoingTrack("video", tracks[0]);
  }

  syncControlState();
  refreshSignedInProfile();
  await refreshLocalPresenceAndTile();
}

function syncControlState() {
  elements.toggleMicLabel.textContent = state.micEnabled ? "Mute" : "Unmute";
  elements.toggleCameraLabel.textContent = state.cameraEnabled ? "Camera off" : "Camera on";
  elements.toggleShareLabel.textContent = state.screenSharing ? "Stop sharing" : "Share screen";
  elements.toggleMicButton.classList.toggle("is-off", !state.micEnabled);
  elements.toggleCameraButton.classList.toggle("is-off", !state.cameraEnabled);
  elements.toggleShareButton.classList.toggle("is-active", state.screenSharing);
}

function initials(value = "") {
  const source = value.trim();
  if (!source) {
    return "OT";
  }

  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function normalizeRoomCode(rawValue) {
  const stripped = rawValue.toLowerCase().replace(/[^a-z]/g, "");
  if (stripped.length !== 10) {
    return "";
  }

  return `${stripped.slice(0, 3)}-${stripped.slice(3, 7)}-${stripped.slice(7, 10)}`;
}

function generateRoomCode() {
  let room = "";

  while (room.length < 10) {
    room += roomAlphabet[Math.floor(Math.random() * roomAlphabet.length)];
  }

  return normalizeRoomCode(room);
}

function getRoomLink(roomCode) {
  const baseUrl = normalizeBaseUrl(appConfig.publicBaseUrl) || `${window.location.origin}${window.location.pathname}`;
  const url = new URL(baseUrl);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch (error) {
    console.error(error);
    showToast("Clipboard access failed.");
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2800);
}
