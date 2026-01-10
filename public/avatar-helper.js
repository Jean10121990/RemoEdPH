// Small helper to standardize avatar loading and toggling
// Usage: setAvatar({ imageUrl, displayName, imgEl, textEl })
window.setAvatar = function setAvatar(opts) {
  try {
    if (!opts) return;
    const { imageUrl, displayName, imgEl, textEl, imgSelector, textSelector } = opts;

    const img = imgEl || (imgSelector ? document.querySelector(imgSelector) : null);
    const text = textEl || (textSelector ? document.querySelector(textSelector) : null);

    // Ensure fallback is set
    if (text && displayName) {
      text.textContent = displayName[0].toUpperCase();
    }

    if (!img || !text) return;

    if (!imageUrl || imageUrl.trim() === '') {
      img.style.display = 'none';
      text.style.display = 'block';
      return;
    }

    // Test load the image first
    const testImage = new Image();
    testImage.onload = function() {
      img.src = imageUrl;
      img.style.display = 'block';
      text.style.display = 'none';
    };
    testImage.onerror = function() {
      img.style.display = 'none';
      text.style.display = 'block';
    };
    testImage.src = imageUrl;
  } catch (err) {
    console.error('setAvatar error', err);
  }
};
