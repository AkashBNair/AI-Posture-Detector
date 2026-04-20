// Initialize MediaPipe Module BEFORE any other scripts load
// This must run synchronously in the HTML head before mediapipe scripts load

(function() {
  'use strict';

  // Create Module object if it doesn't exist
  if (!window.Module) {
    window.Module = {};
  }

  // Create a handler that intercepts all property access on dataFileDownloads
  const handler = {
    get: function(target, prop) {
      if (!(prop in target)) {
        // Auto-create properties with the structure MediaPipe expects
        target[prop] = { 
          loaded: 0, 
          total: 0 
        };
      }
      return target[prop];
    },
    set: function(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has: function(target, prop) {
      return true; // Pretend all properties exist
    },
    ownKeys: function(target) {
      return Object.keys(target);
    },
    getOwnPropertyDescriptor: function(target, prop) {
      return {
        configurable: true,
        enumerable: true,
        value: target[prop]
      };
    }
  };

  // Create the Proxy for dataFileDownloads
  if (!window.Module.dataFileDownloads) {
    window.Module.dataFileDownloads = new Proxy({}, handler);
  }

  // Also add onProgress handler that prevents errors
  if (!window.Module.onProgress) {
    window.Module.onProgress = function() {};
  }

  // Set up a global error handler to catch and suppress MediaPipe-specific errors
  window.addEventListener('error', function(event) {
    // Suppress MediaPipe asset loader errors
    if (event.filename && (
      event.filename.includes('pose_solution') ||
      event.filename.includes('mediapipe') ||
      event.filename.includes('packed_assets_loader')
    )) {
      if (event.message && (
        event.message.includes('Cannot read properties') ||
        event.message.includes('Cannot set properties') ||
        event.message.includes('dataFileDownloads')
      )) {
        // Prevent the error from being logged to console
        event.preventDefault();
        return true;
      }
    }
    return false;
  }, true); // Use capture phase to intercept early

})();
