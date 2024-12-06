document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const deleteVodsButton = document.getElementById("deleteVodsButton");
  const retryVodsCheckbox = document.getElementById("retryVodsCheckbox");
  const stopRetryButton = document.getElementById("stopRetryButton");
  const statusDiv = document.getElementById("status");
  const deletedCountDiv = document.getElementById("deletedCount");
  const vodDeletionStatusDiv = document.getElementById("vodDeletionStatus");

  // Load state from local storage
  chrome.storage.local.get(
    ["deletionCount", "isRunning", "isRetryingVODs", "vodDeletionStatus"],
    (data) => {
      if (data.deletionCount !== undefined) {
        deletedCountDiv.textContent = `Deleted Clips: ${data.deletionCount}`;
      }
      if (data.isRunning) {
        statusDiv.textContent = "Status: Running...";
        startButton.style.display = "none";
        stopButton.style.display = "block";
      } else {
        statusDiv.textContent = "Status: Idle";
        startButton.style.display = "block";
        stopButton.style.display = "none";
      }
      if (data.isRetryingVODs) {
        retryVodsCheckbox.checked = true;
        stopRetryButton.disabled = false;
        vodDeletionStatusDiv.textContent =
          data.vodDeletionStatus || "Retrying VOD deletion...";
      } else {
        retryVodsCheckbox.checked = false;
        stopRetryButton.disabled = true;
        vodDeletionStatusDiv.textContent =
          data.vodDeletionStatus || "No active VOD deletion.";
      }
    }
  );

  // Start button
  startButton.addEventListener("click", () => {
    chrome.storage.local.set({ isRunning: true });
    chrome.runtime.sendMessage({ action: "start" }, (response) => {
      statusDiv.textContent = response;
      startButton.style.display = "none";
      stopButton.style.display = "block";
    });
  });

  // Stop button
  stopButton.addEventListener("click", () => {
    chrome.storage.local.set({ isRunning: false });
    chrome.runtime.sendMessage({ action: "stop" }, (response) => {
      statusDiv.textContent = response;
      startButton.style.display = "block";
      stopButton.style.display = "none";
    });
  });

  // Delete all VODs button
  deleteVodsButton.addEventListener("click", () => {
    const retry = retryVodsCheckbox.checked;
    vodDeletionStatusDiv.textContent = "Deleting all VODs...";
    stopRetryButton.disabled = !retry;
    chrome.storage.local.set({
      isRetryingVODs: retry,
      vodDeletionStatus: "Deleting all VODs...",
    });
    chrome.runtime.sendMessage({ action: "deleteAllVODs", retry }, (response) => {
      chrome.storage.local.set({ vodDeletionStatus: response });
      vodDeletionStatusDiv.textContent = response;
      if (!retry) stopRetryButton.disabled = true;
    });
  });

  // Stop retry button
  stopRetryButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopRetry" }, (response) => {
      chrome.storage.local.set({
        isRetryingVODs: false,
        vodDeletionStatus: response,
      });
      vodDeletionStatusDiv.textContent = response;
      stopRetryButton.disabled = true;
      retryVodsCheckbox.checked = false;
    });
  });

  // Periodically refresh UI for deletion count and retry status
  setInterval(() => {
    chrome.storage.local.get(
      ["deletionCount", "isRetryingVODs", "vodDeletionStatus"],
      (data) => {
        if (data.deletionCount !== undefined) {
          deletedCountDiv.textContent = `Deleted Clips: ${data.deletionCount}`;
        }
        if (data.isRetryingVODs) {
          vodDeletionStatusDiv.textContent =
            data.vodDeletionStatus || "Retrying VOD deletion...";
          stopRetryButton.disabled = false;
        } else {
          vodDeletionStatusDiv.textContent =
            data.vodDeletionStatus || "No active VOD deletion.";
          stopRetryButton.disabled = true;
        }
      }
    );
  }, 1000); // Refresh every second

  // Ensure slider toggles the checkbox state
  document.querySelectorAll('.slider').forEach(slider => {
    slider.addEventListener('click', () => {
      const input = slider.querySelector('input');
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change'));
    });
  });
});
