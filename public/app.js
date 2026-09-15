/* =========================================================================
   NeckHofis IoT Telemetry Dashboard - Application Logic
   ========================================================================= */

// State Management
const state = {
  readings: [],
  latestReading: null,
  stats: null,
  autoRefresh: true,
  refreshIntervalSeconds: 5,
  remainingSeconds: 5,
  timerId: null,
  countdownId: null,
  autoSimId: null,
  temperatureChart: null,
  frequencyChart: null,
  maxChartPoints: 25
};

// DOM Elements
const elements = {
  // Badges & Counters
  deviceStatusBadge: document.getElementById('deviceStatusBadge'),
  deviceStatusText: document.getElementById('deviceStatusText'),
  dbStatusBadge: document.getElementById('dbStatusBadge'),
  dbStatusText: document.getElementById('dbStatusText'),
  syncCountdown: document.getElementById('syncCountdown'),
  autoRefreshToggle: document.getElementById('autoRefreshToggle'),
  currentTimeDisplay: document.getElementById('currentTimeDisplay'),
  lastReceivedTime: document.getElementById('lastReceivedTime'),
  refreshBtn: document.getElementById('refreshBtn'),
  refreshIcon: document.getElementById('refreshIcon'),

  // Metric Cards
  leftTempValue: document.getElementById('leftTempValue'),
  leftTempFahrenheit: document.getElementById('leftTempFahrenheit'),
  leftTempPill: document.getElementById('leftTempPill'),

  rightTempValue: document.getElementById('rightTempValue'),
  rightTempFahrenheit: document.getElementById('rightTempFahrenheit'),

  freqValue: document.getElementById('freqValue'),
  freqDescription: document.getElementById('freqDescription'),
  freqBandPill: document.getElementById('freqBandPill'),
  freqMeterFill: document.getElementById('freqMeterFill'),

  diffValue: document.getElementById('diffValue'),
  diffPill: document.getElementById('diffPill'),
  meanTempValue: document.getElementById('meanTempValue'),

  // Simulator
  simulatorBtn: document.getElementById('simulatorBtn'),
  simulatorPanel: document.getElementById('simulatorPanel'),
  simLeftTemp: document.getElementById('simLeftTemp'),
  simLeftDisplay: document.getElementById('simLeftDisplay'),
  simOffset: document.getElementById('simOffset'),
  simOffsetDisplay: document.getElementById('simOffsetDisplay'),
  simFrequency: document.getElementById('simFrequency'),
  simFreqDisplay: document.getElementById('simFreqDisplay'),
  sendSimPacketBtn: document.getElementById('sendSimPacketBtn'),
  autoSimToggleBtn: document.getElementById('autoSimToggleBtn'),

  // Table
  telemetryTableBody: document.getElementById('telemetryTableBody'),
  tableRecordCount: document.getElementById('tableRecordCount'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  clearDataBtn: document.getElementById('clearDataBtn'),

  // Accordion
  docsAccordionToggle: document.getElementById('docsAccordionToggle'),
  docsContent: document.getElementById('docsContent'),
  docsChevron: document.getElementById('docsChevron'),

  // Toasts
  toastContainer: document.getElementById('toastContainer')
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initCharts();
  bindEvents();
  fetchAllData();
  startSyncLoop();
});

// Real-time Clock
function initClock() {
  const updateClock = () => {
    const now = new Date();
    elements.currentTimeDisplay.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// ================= EVENT BINDINGS =================
function bindEvents() {
  // Manual refresh
  elements.refreshBtn.addEventListener('click', () => {
    elements.refreshIcon.classList.add('fa-spin-fast');
    state.remainingSeconds = state.refreshIntervalSeconds;
    fetchAllData().finally(() => {
      setTimeout(() => elements.refreshIcon.classList.remove('fa-spin-fast'), 600);
    });
  });

  // Auto refresh toggle
  elements.autoRefreshToggle.addEventListener('change', (e) => {
    state.autoRefresh = e.target.checked;
    if (state.autoRefresh) {
      state.remainingSeconds = state.refreshIntervalSeconds;
      startSyncLoop();
      showToast('Auto-sync enabled (every 5s)', 'info');
    } else {
      clearInterval(state.countdownId);
      elements.syncCountdown.textContent = 'PAUSED';
      showToast('Auto-sync paused', 'warning');
    }
  });

  // Simulator Drawer Toggle
  elements.simulatorBtn.addEventListener('click', () => {
    elements.simulatorPanel.classList.toggle('hidden');
    elements.simulatorBtn.classList.toggle('active');
  });

  // Simulator Sliders
  elements.simLeftTemp.addEventListener('input', (e) => {
    elements.simLeftDisplay.textContent = parseFloat(e.target.value).toFixed(2);
  });
  elements.simOffset.addEventListener('input', (e) => {
    elements.simOffsetDisplay.textContent = '+' + parseFloat(e.target.value).toFixed(2);
  });
  elements.simFrequency.addEventListener('input', (e) => {
    elements.simFreqDisplay.textContent = parseFloat(e.target.value).toFixed(1);
  });

  // Send Simulated Packet
  elements.sendSimPacketBtn.addEventListener('click', injectSimulatedPacket);

  // Auto-Simulator Loop Toggle
  elements.autoSimToggleBtn.addEventListener('click', toggleAutoSimulator);

  // CSV Export
  elements.exportCsvBtn.addEventListener('click', exportToCsv);

  // Clear Data
  elements.clearDataBtn.addEventListener('click', handleClearData);

  // Documentation Accordion
  elements.docsAccordionToggle.addEventListener('click', () => {
    const isHidden = elements.docsContent.classList.toggle('hidden');
    elements.docsChevron.classList.toggle('fa-chevron-up', !isHidden);
    elements.docsChevron.classList.toggle('fa-chevron-down', isHidden);
  });
}

// ================= SYNC & DATA FETCHING =================
function startSyncLoop() {
  clearInterval(state.countdownId);

  state.countdownId = setInterval(() => {
    if (!state.autoRefresh) return;

    state.remainingSeconds--;
    if (state.remainingSeconds <= 0) {
      state.remainingSeconds = state.refreshIntervalSeconds;
      elements.syncCountdown.textContent = `${state.refreshIntervalSeconds}s`;
      fetchAllData();
    } else {
      elements.syncCountdown.textContent = `${state.remainingSeconds}s`;
    }
  }, 1000);
}

async function fetchAllData() {
  try {
    const [readingsRes, statsRes] = await Promise.all([
      fetch('/api/readings?limit=50'),
      fetch('/api/readings/stats')
    ]);

    if (!readingsRes.ok || !statsRes.ok) {
      throw new Error('API request failed');
    }

    const readingsData = await readingsRes.json();
    const statsData = await statsRes.json();

    if (readingsData.success) {
      state.readings = readingsData.data || [];
      updateTable(state.readings);
      updateCharts(state.readings);
    }

    if (statsData.success) {
      state.stats = statsData.stats;
      updateHeaderBadges(statsData.stats, readingsData.storage);
      if (statsData.stats.latestReading) {
        updateMetricCards(statsData.stats.latestReading);
      }
    }
  } catch (err) {
    console.error('Fetch error:', err);
    updateDeviceStatusBadge('offline', 'OFFLINE / SERVER UNREACHABLE');
  }
}

// ================= UI UPDATERS =================
function updateHeaderBadges(stats, storageType) {
  // Device Online / Standby / Offline Status
  if (stats.deviceStatus === 'online') {
    updateDeviceStatusBadge('online', 'ONLINE (TRANSMITTING)');
  } else if (stats.deviceStatus === 'idle') {
    updateDeviceStatusBadge('idle', 'STANDBY (IDLE)');
  } else {
    updateDeviceStatusBadge('offline', 'OFFLINE');
  }

  // Database Connection Badge
  if (stats.dbConnected) {
    elements.dbStatusBadge.className = 'status-indicator-box status-online';
    elements.dbStatusText.textContent = 'MONGODB ATLAS';
    elements.dbStatusText.style.color = '#34d399';
  } else {
    elements.dbStatusBadge.className = 'status-indicator-box status-idle';
    elements.dbStatusText.textContent = 'IN-MEMORY BUFFER';
    elements.dbStatusText.style.color = '#fbbf24';
  }
}

function updateDeviceStatusBadge(statusClass, label) {
  elements.deviceStatusBadge.className = `status-indicator-box status-${statusClass}`;
  elements.deviceStatusText.textContent = label;
}

function updateMetricCards(reading) {
  if (!reading) return;

  const left = reading.leftTemperature;
  const right = reading.rightTemperature;
  const freq = reading.frequency;

  // 1. Left Temperature Card
  elements.leftTempValue.textContent = left.toFixed(2);
  const leftF = ((left * 9) / 5 + 32).toFixed(1);
  elements.leftTempFahrenheit.textContent = `${leftF} °F`;

  if (left < 37.3) {
    elements.leftTempPill.className = 'state-pill pill-normal';
    elements.leftTempPill.textContent = 'Normal Range';
  } else if (left <= 38.0) {
    elements.leftTempPill.className = 'state-pill pill-elevated';
    elements.leftTempPill.textContent = 'Elevated';
  } else {
    elements.leftTempPill.className = 'state-pill pill-fever';
    elements.leftTempPill.textContent = 'Fever Alert';
  }

  // 2. Right Temperature Card (Estimated)
  elements.rightTempValue.textContent = right.toFixed(2);
  const rightF = ((right * 9) / 5 + 32).toFixed(1);
  elements.rightTempFahrenheit.textContent = `${rightF} °F`;

  // 3. Differential Card
  const diff = Math.abs(left - right).toFixed(2);
  const mean = ((left + right) / 2).toFixed(2);
  elements.diffValue.textContent = diff;
  elements.meanTempValue.textContent = `Mean: ${mean} °C`;

  if (parseFloat(diff) <= 0.35) {
    elements.diffPill.className = 'state-pill pill-balanced';
    elements.diffPill.textContent = 'Symmetric';
  } else {
    elements.diffPill.className = 'state-pill pill-elevated';
    elements.diffPill.textContent = 'Asymmetric';
  }

  // 4. Acoustic Frequency Card
  elements.freqValue.textContent = freq.toFixed(1);

  // Band classification
  if (freq < 85) {
    elements.freqBandPill.textContent = 'Infrasonic / Low';
    elements.freqDescription.textContent = 'Low-frequency subharmonic';
  } else if (freq <= 255) {
    elements.freqBandPill.textContent = 'Vocal Fundamental';
    elements.freqDescription.textContent = 'Throat vibration band';
  } else {
    elements.freqBandPill.textContent = 'High Acoustic';
    elements.freqDescription.textContent = 'Swallow / friction acoustic';
  }

  // Percentage for meter fill (capped at 400 Hz)
  const pct = Math.min(Math.max((freq / 350) * 100, 4), 100);
  elements.freqMeterFill.style.width = `${pct}%`;

  // Last received timestamp
  const dateObj = new Date(reading.timestamp);
  elements.lastReceivedTime.textContent = dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ================= TABLE =================
function updateTable(readings) {
  elements.tableRecordCount.textContent = `${readings.length} recordings stored`;

  if (!readings || readings.length === 0) {
    elements.telemetryTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center empty-state">
          <div class="empty-box">
            <i class="fa-solid fa-satellite-dish fa-spin"></i>
            <p>Listening for ESP8266 telemetry packets on <code>/tempstore</code>...</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = readings.map((item) => {
    const time = new Date(item.timestamp);
    const timeFormatted = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateFormatted = time.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeAgo = formatTimeAgo(time);

    const diff = Math.abs(item.leftTemperature - item.rightTemperature).toFixed(2);
    const isMongo = item._id && !item._id.toString().startsWith('mem_') && !item._id.toString().startsWith('sim_');
    const storageBadge = isMongo
      ? '<span class="badge-source badge-mongo">Atlas</span>'
      : '<span class="badge-source badge-mem">RAM</span>';

    return `
      <tr>
        <td><strong>${timeFormatted}</strong> <span style="color: #64748b; font-size: 0.75rem;">${dateFormatted}</span></td>
        <td style="color: #94a3b8;">${timeAgo}</td>
        <td style="color: #38bdf8; font-weight: 600;">${item.leftTemperature.toFixed(2)} °C</td>
        <td style="color: #fbbf24; font-weight: 600;">${item.rightTemperature.toFixed(2)} °C <span style="font-size: 0.68rem; color: #64748b;">(Est)</span></td>
        <td style="color: #cbd5e1;">${diff} °C</td>
        <td style="color: #c084fc; font-weight: 600;">${item.frequency.toFixed(1)} Hz</td>
        <td style="color: #64748b; font-size: 0.75rem;">${item.deviceIp || '127.0.0.1'}</td>
        <td>${storageBadge}</td>
      </tr>
    `;
  }).join('');

  elements.telemetryTableBody.innerHTML = rowsHtml;
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ================= CHARTS =================
function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(16, 24, 45, 0.92)',
        titleFont: { family: 'Inter', size: 12 },
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10,
        boxPadding: 4
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
      }
    }
  };

  // Temperature Chart
  const ctxTemp = document.getElementById('temperatureChart').getContext('2d');
  const gradCyan = ctxTemp.createLinearGradient(0, 0, 0, 260);
  gradCyan.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
  gradCyan.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  state.temperatureChart = new Chart(ctxTemp, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Left Temp (Live A0)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: gradCyan,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#06b6d4',
          pointHoverRadius: 6
        },
        {
          label: 'Right Temp (Est A1)',
          data: [],
          borderColor: '#f59e0b',
          borderDash: [5, 4],
          borderWidth: 2,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#f59e0b',
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          ...commonOptions.scales.y,
          title: { display: true, text: 'Temperature (°C)', color: '#94a3b8', font: { size: 11 } }
        }
      }
    }
  });

  // Frequency Chart
  const ctxFreq = document.getElementById('frequencyChart').getContext('2d');
  const gradPurple = ctxFreq.createLinearGradient(0, 0, 0, 260);
  gradPurple.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
  gradPurple.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

  state.frequencyChart = new Chart(ctxFreq, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Frequency (Hz)',
          data: [],
          borderColor: '#a855f7',
          backgroundColor: gradPurple,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#a855f7',
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          ...commonOptions.scales.y,
          title: { display: true, text: 'Frequency (Hz)', color: '#94a3b8', font: { size: 11 } }
        }
      }
    }
  });
}

function updateCharts(readings) {
  if (!state.temperatureChart || !state.frequencyChart) return;
  if (!readings || readings.length === 0) return;

  // Chronological order for chart (oldest to newest)
  const chronological = [...readings].slice(0, state.maxChartPoints).reverse();

  const labels = chronological.map((d) => {
    const date = new Date(d.timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const leftTemps = chronological.map((d) => d.leftTemperature);
  const rightTemps = chronological.map((d) => d.rightTemperature);
  const freqs = chronological.map((d) => d.frequency);

  // Update Temperature Chart
  state.temperatureChart.data.labels = labels;
  state.temperatureChart.data.datasets[0].data = leftTemps;
  state.temperatureChart.data.datasets[1].data = rightTemps;
  state.temperatureChart.update('none');

  // Update Frequency Chart
  state.frequencyChart.data.labels = labels;
  state.frequencyChart.data.datasets[0].data = freqs;
  state.frequencyChart.update('none');
}

// ================= SIMULATOR =================
async function injectSimulatedPacket() {
  const left = parseFloat(elements.simLeftTemp.value);
  const offset = parseFloat(elements.simOffset.value);
  const freq = parseFloat(elements.simFrequency.value);

  elements.sendSimPacketBtn.disabled = true;
  elements.sendSimPacketBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    const res = await fetch('/api/readings/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leftTemperature: left,
        rightOffset: offset,
        frequency: freq
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Packet injected! Left: ${left}°C, Right: ${(left + offset).toFixed(2)}°C, Freq: ${freq}Hz`, 'success');
      fetchAllData();
    } else {
      showToast('Simulation failed: ' + (data.error || 'Unknown error'), 'danger');
    }
  } catch (err) {
    showToast('Failed to connect to simulator endpoint', 'danger');
  } finally {
    elements.sendSimPacketBtn.disabled = false;
    elements.sendSimPacketBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test Packet';
  }
}

function toggleAutoSimulator() {
  if (state.autoSimId) {
    clearInterval(state.autoSimId);
    state.autoSimId = null;
    elements.autoSimToggleBtn.innerHTML = '<i class="fa-solid fa-play"></i> Auto Simulate (10s)';
    elements.autoSimToggleBtn.classList.remove('btn-accent');
    elements.autoSimToggleBtn.classList.add('btn-outline');
    showToast('Auto simulation stopped', 'info');
  } else {
    elements.autoSimToggleBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Auto Sim';
    elements.autoSimToggleBtn.classList.remove('btn-outline');
    elements.autoSimToggleBtn.classList.add('btn-accent');
    showToast('Auto simulation started: sending every 10s', 'success');

    // Run immediately once
    injectSimulatedPacket();
    state.autoSimId = setInterval(() => {
      // Add slight jitter
      const currentVal = parseFloat(elements.simLeftTemp.value);
      const jitter = (Math.random() - 0.5) * 0.3;
      elements.simLeftTemp.value = (currentVal + jitter).toFixed(2);
      elements.simLeftDisplay.textContent = elements.simLeftTemp.value;

      const currentFreq = parseFloat(elements.simFrequency.value);
      const freqJitter = (Math.random() - 0.5) * 20;
      elements.simFrequency.value = Math.max(70, Math.min(380, currentFreq + freqJitter)).toFixed(1);
      elements.simFreqDisplay.textContent = elements.simFrequency.value;

      injectSimulatedPacket();
    }, 10000);
  }
}

// ================= CSV EXPORT =================
function exportToCsv() {
  if (state.readings.length === 0) {
    showToast('No telemetry data to export.', 'warning');
    return;
  }

  const headers = ['Timestamp', 'ISO_Date', 'Left_Temp_Celsius', 'Right_Temp_Celsius_Estimated', 'Difference_Celsius', 'Frequency_Hz', 'Device_IP'];
  const rows = state.readings.map((r) => [
    new Date(r.timestamp).toLocaleString(),
    new Date(r.timestamp).toISOString(),
    r.leftTemperature,
    r.rightTemperature,
    Math.abs(r.leftTemperature - r.rightTemperature).toFixed(2),
    r.frequency,
    r.deviceIp || 'unknown'
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `neckhofis_telemetry_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Telemetry CSV exported successfully!', 'success');
}

// ================= CLEAR DATA =================
async function handleClearData() {
  if (!confirm('Are you sure you want to clear all telemetry records?')) return;

  try {
    const res = await fetch('/api/readings', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('All telemetry data cleared.', 'info');
      fetchAllData();
    } else {
      showToast('Failed to clear records: ' + (data.error || ''), 'danger');
    }
  } catch (err) {
    showToast('Failed to reach server to clear data.', 'danger');
  }
}

// ================= TOAST NOTIFICATION =================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'danger') icon = 'fa-circle-xmark';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
