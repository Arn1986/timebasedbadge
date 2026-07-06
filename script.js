
let aesKey = null;
let aesKeyBytes = null;
let intervalId = null;
let countdownInterval = null;
let nextRefreshIn = 0;

document.getElementById("timeType").addEventListener("change", () => {
  const selected = parseInt(document.getElementById("timeType").value);
  document.getElementById("localTimeInputs").style.display = (selected === 4) ? "block" : "none";
});

async function generateKey() {
  aesKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 128 }, true, ["encrypt"]);
  aesKeyBytes = new Uint8Array(await window.crypto.subtle.exportKey("raw", aesKey));
  document.getElementById("aesKeyValue").textContent = "0x" + toHex(aesKeyBytes);
  document.getElementById("keyText").style.display = "block";
  document.getElementById("copyIcon").style.display = "inline";
}

function toHex(buffer) {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function intToBytesBE(value, length) {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = value & 0xff;
    value >>= 8;
  }
  return bytes;
}

function timeToSeconds(hhmmss) {
  if (!hhmmss) return 0;
  const [hh, mm, ss] = hhmmss.split(":").map(Number);
  return (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);
}

function formatDate(epoch) {
  const date = new Date(epoch * 1000);
  return date.toISOString().replace("T", " ").replace("Z", ".000");
}

async function generateQRCode(badge, interval, protocolVersion) {
  const timeType = parseInt(document.getElementById("timeType").value);

  let start, end;
  if (timeType === 4) {
    const localStart = document.getElementById("localStart").value;
    const localEnd = document.getElementById("localEnd").value;
    start = timeToSeconds(localStart);
    end = timeToSeconds(localEnd);
  } else {
    let now;
    if (timeType === 2) {
      now = Math.floor(Date.now() / 1000);
    } else if (timeType === 3) {
      const localDate = new Date();
      now = Math.floor(localDate.getTime() / 1000 - localDate.getTimezoneOffset() * 60);
    } else {
      now = 0;
    }
    start = (timeType === 0) ? 0 : now;
    end = (timeType === 0) ? 0 : now + interval;
  }

  const badgeBytes = intToBytesBE(badge, 4);
  const timeTypeByte = intToBytesBE(timeType, 1);
  const startBytes = intToBytesBE(start, 4);
  const endBytes = intToBytesBE(end, 4);
  const payload = new Uint8Array([...badgeBytes, ...timeTypeByte, ...startBytes, ...endBytes]);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  document.getElementById("ivText").textContent = "IV              : 0x" + toHex(iv);
  document.getElementById("ivText").style.display = "block";

  let info = `Badge Number    : ${badge}<br>`;
  if (timeType === 4) {
    info += `Start Time      : ${start} sec from midnight<br>`;
    info += `End Time        : ${end} sec from midnight`;
  } else {
    info += `Start Time      : ${start} (${formatDate(start)})<br>`;
    info += `End Time        : ${end} (${formatDate(end)})`;
  }
  document.getElementById("infoText").innerHTML = info;
  document.getElementById("infoText").style.display = "block";

  document.getElementById("unencryptedText").textContent = "Unencrypted Data: 0x" + toHex(payload);
  document.getElementById("unencryptedText").style.display = "block";

  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, payload);
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const tag = encryptedBytes.slice(encryptedBytes.length - 16);
  const finalBytes = new Uint8Array([protocolVersion, ...iv, ...ciphertext, ...tag]);
  const finalHex = toHex(finalBytes);

  document.getElementById("outputText").textContent = "Final Output    : 0x" + finalHex;
  document.getElementById("outputText").style.display = "block";
  document.getElementById("countdown").style.display = "block";

  const canvas = document.getElementById("qrcodeCanvas");
  QRCode.toCanvas(canvas, finalHex, { width: Math.min(256, window.innerWidth - 40), margin: 2 });
}

async function startGenerator() {
  const badgeRaw = document.getElementById("badge").value.trim();
  const intervalRaw = document.getElementById("interval").value.trim();
  const protocolRaw = document.getElementById("protocolVersion").value.trim();

  const badge = parseInt(badgeRaw);
  const interval = parseInt(intervalRaw);
  const protocolVersion = parseInt(protocolRaw);

  if (isNaN(badge) || badge < 0) return alert("Invalid badge number.");
  if (isNaN(interval) || interval <= 0) return alert("Invalid interval.");
  if (isNaN(protocolVersion) || protocolVersion < 0 || protocolVersion > 255)
    return alert("Invalid protocol version (0–255).");

  if (!aesKey) await generateKey();

  const refreshMs = interval * 1000;
  nextRefreshIn = interval;

  clearInterval(intervalId);
  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    if (nextRefreshIn > 0) {
      nextRefreshIn--;
      document.getElementById("countdown").textContent = `Next refresh in: ${nextRefreshIn}s`;
    }
  }, 1000);

  const runGen = async () => {
    await generateQRCode(badge, interval, protocolVersion);
    nextRefreshIn = interval;
    document.getElementById("countdown").textContent = `Next refresh in: ${nextRefreshIn}s`;
  };

  await runGen();
  intervalId = setInterval(runGen, refreshMs);
}

document.getElementById("keyText").addEventListener("click", () => {
  const keySpan = document.getElementById("aesKeyValue");
  const icon = document.getElementById("copyIcon");
  const match = keySpan.textContent.match(/0x([0-9A-F]+)/);
  if (match && match[1]) {
    navigator.clipboard.writeText(match[1]).then(() => {
      const original = keySpan.textContent;
      keySpan.textContent = "Copied!";
      icon.style.display = "none";
      setTimeout(() => {
        keySpan.textContent = original;
        icon.style.display = "inline";
      }, 1500);
    });
  }
});
