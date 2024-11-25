let intervalId = null;
let deletedCount = 0;

// Fetch the session token from cookies and decode it
function getSessionToken(callback) {
  chrome.cookies.get({ url: "https://kick.com", name: "session_token" }, (cookie) => {
    if (cookie && cookie.value) {
      const decodedToken = decodeURIComponent(cookie.value); // Decode the token
      console.log("Decoded session token fetched from cookies:", decodedToken);
      callback(decodedToken);
    } else {
      console.error("Failed to fetch session token from cookies.");
      callback(null);
    }
  });
}

// Fetch clips
async function fetchClips(username) {
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${username}/clips?nocache=${Date.now()}`, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch clips: ${response.status}`);
    }
    const data = await response.json();
    return data.clips || [];
  } catch (error) {
    console.error("Error fetching clips:", error);
    return [];
  }
}

// Delete a clip
async function deleteClip(clipId, token) {
  try {
    const response = await fetch(`https://kick.com/api/v2/clips/${clipId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.ok) {
      deletedCount++;
      return true;
    }
    console.error(`Failed to delete clip ID ${clipId}: ${response.status}`);
    return false;
  } catch (error) {
    console.error(`Error deleting clip ID ${clipId}:`, error);
    return false;
  }
}

// Start the deletion process
async function startProcess(username) {
  getSessionToken(async (token) => {
    if (!token) {
      console.error("Cannot start deletion process without a session token.");
      return;
    }

    intervalId = setInterval(async () => {
      try {
        const clips = await fetchClips(username);
        for (const clip of clips) {
          const isDeleted = await deleteClip(clip.id, token);
          if (!isDeleted) {
            console.log(`Retrying later: Clip ID ${clip.id}`);
          }
        }
        chrome.storage.local.set({ deletionCount: deletedCount });
      } catch (error) {
        console.error("Error in deletion loop:", error);
      }
    }, 5000); // Run every 5 seconds
  });
}

// Stop the deletion process
function stopProcess() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

// Listen for start/stop commands
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "start") {
    const { username } = message;

    deletedCount = 0;
    chrome.storage.local.set({ isRunning: true, username, deletionCount: deletedCount });
    startProcess(username);
  } else if (message.action === "stop") {
    chrome.storage.local.set({ isRunning: false });
    stopProcess();
  }
});

// Restore state on extension startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["isRunning", "username", "deletionCount"], (data) => {
    if (data.isRunning) {
      deletedCount = data.deletionCount || 0;
      console.log("Resuming deletion process...");
      startProcess(data.username);
    } else {
      console.log("No running process to resume.");
    }
  });
});
