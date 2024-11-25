document.addEventListener("DOMContentLoaded", () => {
    const usernameInput = document.getElementById("username");
    const startButton = document.getElementById("startButton");
    const stopButton = document.getElementById("stopButton");
    const statusDiv = document.getElementById("status");
    const deletedCountDiv = document.getElementById("deletedCount");
  
    // Load state from local storage
    chrome.storage.local.get(["username", "deletionCount", "isRunning"], (data) => {
      if (data.username) usernameInput.value = data.username;
      if (data.deletionCount !== undefined) {
        deletedCountDiv.textContent = `Deleted Clips: ${data.deletionCount}`;
      }
      if (data.isRunning) {
        statusDiv.textContent = "Status: Running...";
        startButton.disabled = true;
        stopButton.disabled = false;
      } else {
        statusDiv.textContent = "Status: Idle";
        startButton.disabled = false;
        stopButton.disabled = true;
      }
    });
  
    // Start button
    startButton.addEventListener("click", () => {
      const username = usernameInput.value.trim();
  
      if (!username) {
        statusDiv.textContent = "Status: Please enter a username.";
        return;
      }
  
      chrome.storage.local.set({ isRunning: true, username });
      chrome.runtime.sendMessage({ action: "start", username });
      statusDiv.textContent = "Status: Running...";
      startButton.disabled = true;
      stopButton.disabled = false;
    });
  
    // Stop button
    stopButton.addEventListener("click", () => {
      chrome.storage.local.set({ isRunning: false });
      chrome.runtime.sendMessage({ action: "stop" });
      statusDiv.textContent = "Status: Stopped.";
      startButton.disabled = false;
      stopButton.disabled = true;
    });
  
    // Periodically refresh UI for deletion count
    setInterval(() => {
      chrome.storage.local.get("deletionCount", (data) => {
        if (data.deletionCount !== undefined) {
          deletedCountDiv.textContent = `Deleted Clips: ${data.deletionCount}`;
        }
      });
    }, 5000); // Refresh every 5 second
  });
  