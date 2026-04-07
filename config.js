export const appConfig = {
  appName: "O_Tomeh.Chat",
  publicBaseUrl: "https://otomeh07-dotcom.github.io/O_Tomeh.Chat/",
  supabaseUrl: "https://wcjvhjxixzrkpxqnvgvh.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjanZoanhpeHpya3B4cW52Z3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTYzNjIsImV4cCI6MjA5MDg3MjM2Mn0.I-5JxDzfsMmpOlUSjk35cDlZ52bM5MBLSzUhT83bhDo",
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    // Add a real TURN server below for reliable cross-network audio/video.
    // {
    //   urls: [
    //     "turn:YOUR_TURN_HOST:3478?transport=udp",
    //     "turn:YOUR_TURN_HOST:3478?transport=tcp",
    //   ],
    //   username: "YOUR_TURN_USERNAME",
    //   credential: "YOUR_TURN_PASSWORD",
    // },
  ],
};
