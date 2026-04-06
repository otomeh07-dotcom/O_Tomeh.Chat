import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { appConfig } from "./config.js";

const rtcConfig = {
  iceServers: buildIceServers(),
};

function buildIceServers() {
  const servers = [{ urls: ["stun:stun.l.google.com:19302"] }];

  if (appConfig.turnUrl && appConfig.turnUsername && appConfig.turnCredential) {
    servers.push({
      urls: [appConfig.turnUrl],
      username: appConfig.turnUsername,
      credential: appConfig.turnCredential,
    });
  }

  return servers;
}
