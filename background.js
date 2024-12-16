// Global Variables
let intervalId = null;
let deletedCount = 0;
let retryDeletingVODs = false;
let isAutoDeletionEnabled = false;
let autoDeletionTimeoutId = null;

// Utility Functions
function getSessionToken(callback) {
  chrome.cookies.get({ url: "https://kick.com", name: "session_token" }, (cookie) => {
    if (cookie && cookie.value) {
      const decodedToken = decodeURIComponent(cookie.value);
      callback(decodedToken);
    } else {
      console.error("Failed to fetch session token from cookies.");
      callback(null);
    }
  });
}

function fetchUsername(token, callback) {
  fetch("https://kick.com/api/v1/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/plain, */*",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (data && data.username) {
        callback(data.username);
      } else {
        console.error("Username not found in user data.");
        callback(null);
      }
    })
    .catch((error) => {
      console.error("Error fetching username:", error);
      callback(null);
    });
}

async function isUserLive(username) {
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${username}`, { method: "GET" });
    const data = await response.json();
    // If livestream is not null, user is live
    return data.livestream !== null;
  } catch (err) {
    console.error("Error checking live status:", err);
    return false;
  }
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

// Start the deletion process for clips
async function startClipDeletion() {
  getSessionToken(async (token) => {
    if (!token) {
      console.error("Cannot start clip deletion process without a session token.");
      return;
    }

    fetchUsername(token, async (username) => {
      if (!username) {
        console.error("Failed to retrieve username. Cannot start process.");
        return;
      }

      const deletionLoop = async () => {
        try {
          const clips = await fetchClips(username);
          for (const clip of clips) {
            await deleteClip(clip.id, token);
          }
          chrome.storage.local.set({ deletionCount: deletedCount });
        } catch (error) {
          console.error("Error in clip deletion loop:", error);
        }

        setTimeout(deletionLoop, 60000);
      };

      deletionLoop();
    });
  });
}


// Stop the clip deletion process
function stopClipDeletion() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

// Fetch all VODs
async function fetchVODs(username) {
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${username}/videos`, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch VODs: ${response.status}`);
    }
    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error("Error fetching VODs:", error);
    return [];
  }
}

// Delete a VOD
async function deleteVOD(vodUUID, token) {
  try {
    const response = await fetch(`https://kick.com/api/v1/video/${vodUUID}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error(`Error deleting VOD UUID ${vodUUID}:`, error);
    return false;
  }
}

// Function to delete all VODs in a single attempt
async function deleteAllVODsOnce(callback) {
  getSessionToken(async (token) => {
    if (!token) {
      callback("Error: Missing session token.");
      return;
    }

    fetchUsername(token, async (username) => {
      if (!username) {
        callback("Error: Failed to retrieve username.");
        return;
      }

      const vods = await fetchVODs(username);
      if (vods.length === 0) {
        callback("No VODs found or deleted.");
        return;
      }

      let vodDeletedCount = 0;
      for (const vod of vods) {
        const success = await deleteVOD(vod.video.uuid, token);
        if (success) vodDeletedCount++;
      }

      callback(`Deleted ${vodDeletedCount} VOD(s).`);
    });
  });
}

// Function to retry delete VODs until a VOD is found and deleted
async function deleteAllVODsWithRetry(callback) {
  retryDeletingVODs = true;
  chrome.storage.local.set({ isRetryingVODs: retryDeletingVODs });

  getSessionToken(async (token) => {
    if (!token) {
      callback("Error: Missing session token.");
      chrome.storage.local.set({ isRetryingVODs: false });
      return;
    }

    fetchUsername(token, async (username) => {
      if (!username) {
        callback("Error: Failed to retrieve username.");
        chrome.storage.local.set({ isRetryingVODs: false });
        return;
      }

      const retryLogic = async () => {
        if (!retryDeletingVODs) {
          callback("Retry stopped. No VODs deleted.");
          chrome.storage.local.set({ isRetryingVODs: false });
          return;
        }

        const vods = await fetchVODs(username);
        if (vods.length === 0) {
          const retryMessage = "No VODs found. Retrying in 1 minute...";
          chrome.storage.local.set({ vodDeletionStatus: retryMessage });
          callback(retryMessage);
          setTimeout(retryLogic, 60000); // Retry after 1 minute
          return;
        }

        let vodDeletedCount = 0;
        for (const vod of vods) {
          const success = await deleteVOD(vod.video.uuid, token);
          if (success) {
            vodDeletedCount++;
            const successMessage = `Deleted ${vodDeletedCount} VOD(s). Stopping retry.`;
            retryDeletingVODs = false;
            chrome.storage.local.set({
              isRetryingVODs: false,
              vodDeletionStatus: successMessage,
            });
            callback(successMessage);
            return;
          }
        }

        const noDeleteMessage = "No VODs deleted. Retrying in 1 minute...";
        chrome.storage.local.set({ vodDeletionStatus: noDeleteMessage });
        callback(noDeleteMessage);
        setTimeout(retryLogic, 60000); // Retry again after 1 minute
      };

      retryLogic();
    });
  });
}

// Run the 10-minute deletion cycle (10 iterations every minute)
async function runAutoDeletionCycle(token, username) {
  // Delete all vods and clips every minute for 10 times
  for (let i = 0; i < 10; i++) {
    if (!isAutoDeletionEnabled) return; // Stop if turned off

    // Delete all VODs
    await new Promise((resolve) => {
      deleteAllVODsOnce(() => {
        resolve();
      });
    });

    // Delete all Clips
    const clips = await fetchClips(username);
    for (const clip of clips) {
      await deleteClip(clip.id, token);
    }
    chrome.storage.local.set({ deletionCount: deletedCount });

    // Wait 1 minute before next iteration
    await new Promise(res => setTimeout(res, 60 * 1000));
    if (!isAutoDeletionEnabled) return; // Check again after waiting
  }

  // After 10 minutes, check if still live
  if (!isAutoDeletionEnabled) return;

  const live = await isUserLive(username);
  if (live && isAutoDeletionEnabled) {
    // If still live, run another cycle
    runAutoDeletionCycle(token, username);
  } else {
    // If not live, check again in 5 minutes
    scheduleNextAutoDeletionCheck(token, username);
  }
}

// Schedule the next live check in 5 minutes
function scheduleNextAutoDeletionCheck(token, username) {
  if (!isAutoDeletionEnabled) return;
  autoDeletionTimeoutId = setTimeout(async () => {
    if (!isAutoDeletionEnabled) return;
    const live = await isUserLive(username);
    if (live) {
      // If live start the cycle
      runAutoDeletionCycle(token, username);
    } else {
      // If not live, schedule next check again in 5 min
      scheduleNextAutoDeletionCheck(token, username);
    }
  }, 5 * 60 * 1000);
}

function startAutoDeletion() {
  isAutoDeletionEnabled = true;
  chrome.storage.local.set({ isAutoDeletionEnabled: true });
  getSessionToken((token) => {
    if (!token) {
      console.error("Cannot start auto deletion without token");
      return;
    }
    fetchUsername(token, (username) => {
      if (!username) {
        console.error("Cannot start auto deletion without username");
        return;
      }
      // Start by scheduling the first check in 10 minutes
      // Optionally, you could check immediately once
      scheduleNextAutoDeletionCheck(token, username);
    });
  });
}

function stopAutoDeletion() {
  isAutoDeletionEnabled = false;
  chrome.storage.local.set({ isAutoDeletionEnabled: false });
  if (autoDeletionTimeoutId) {
    clearTimeout(autoDeletionTimeoutId);
    autoDeletionTimeoutId = null;
  }
}


// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    deletedCount = 0;
    chrome.storage.local.set({ isRunning: true, deletionCount: deletedCount });
    startClipDeletion();
    sendResponse("Clip deletion started.");
  } else if (message.action === "stop") {
    chrome.storage.local.set({ isRunning: false });
    stopClipDeletion();
    sendResponse("Clip deletion stopped.");
  } else if (message.action === "deleteAllVODs") {
    if (message.retry) {
      deleteAllVODsWithRetry((status) => {
        sendResponse(status);
      });
    } else {
      deleteAllVODsOnce((status) => {
        sendResponse(status);
      });
    }
    return true;
  } else if (message.action === "stopRetry") {
    retryDeletingVODs = false;
    chrome.storage.local.set({ isRetryingVODs: false });
    sendResponse("Retry stopped. No VODs deleted.");
  } else if (message.action === "startAutoDeletion") {
    startAutoDeletion();
    sendResponse("Auto deletion started.");
  } else if (message.action === "stopAutoDeletion") {
    stopAutoDeletion();
    sendResponse("Auto deletion stopped.");
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["isRunning", "deletionCount", "isRetryingVODs", "isAutoDeletionEnabled"], (data) => {
    // Restart clip deletion if it was running
    if (data.isRunning) {
      deletedCount = data.deletionCount || 0;
      startClipDeletion();
    }

    // Restart VOD deletion with retry if it was active
    if (data.isRetryingVODs) {
      retryDeletingVODs = true;
      deleteAllVODsWithRetry((status) => {
        console.log("VOD Deletion Status on Startup:", status);
      });
    }

    // Restart auto deletion if it was enabled
    if (data.isAutoDeletionEnabled) {
      startAutoDeletion();
    }
  });
});
