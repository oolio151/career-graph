"use strict";

const checkButton = document.querySelector("#check-api");
const statusMessage = document.querySelector("#api-status");

if (checkButton && statusMessage) {
  checkButton.addEventListener("click", async () => {
    checkButton.disabled = true;
    statusMessage.textContent = "Connecting…";

    try {
      const response = await fetch(checkButton.dataset.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.status !== "ok") throw new Error("Unexpected backend status");
      statusMessage.textContent = "Connected! Flask and JavaScript are working together.";
    } catch (error) {
      statusMessage.textContent = "Could not connect. Check that the Flask server is running.";
      console.error("Backend connection failed:", error);
    } finally {
      checkButton.disabled = false;
    }
  });
}
