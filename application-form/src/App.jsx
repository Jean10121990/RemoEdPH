import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';

function LiveVideoPreview({ stream, className = '' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const hasLiveVideo = stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (hasLiveVideo) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={className}
    />
  );
}

function stopMediaStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_e) {
        /* ignore */
      }
    });
  } catch (_e2) {
    /* ignore */
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidName(name) {
  return String(name || '').trim().length >= 2;
}

function isValidContact(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

const PEDAGOGICAL_QUESTIONS = [
  'How do you adjust instruction for students with mixed learning levels?',
  'Describe a strategy you use to keep disengaged students involved.',
  'How do you check real understanding, not just memorization?'
];

const TEACHING_SCENARIO = {
  title: "'The Hungry Bear' (Target: 5-year-old ESL learners)",
  goal: 'Teach the difference between BIG and SMALL using TPR (Total Physical Response).',
  instructions: [
    "Visuals: Use your arms to show 'BIG' and your fingers to show 'SMALL'.",
    "Action: Pretend to 'EAT' with big and small bites.",
    "Language: Keep sentences to 3-4 words max (e.g., 'This is BIG! Munch, munch!').",
    'Tech Reminder: Ensure your background is clutter-free and your wired connection is stable to avoid lag during gestures.'
  ]
};

const initialForm = {
  fullName: '',
  email: '',
  contactNo: '',
  testAnswers: ['', '', ''],
  testVideos: ['', '', ''],
  demoVideoUrl: '',
  documents: {
    nationalId: '',
    nbi: ''
  }
};

/** ngrok free tier may return an HTML warning page for programmatic requests unless this header is sent. */
function tunnelSafeHeaders(extra = {}) {
  if (typeof window === 'undefined') return extra;
  const host = window.location.hostname || '';
  const isNgrok = /\.ngrok-free\.dev$/i.test(host) || /\.ngrok\.io$/i.test(host) || /\.ngrok\.app$/i.test(host);
  return isNgrok ? { ...extra, 'ngrok-skip-browser-warning': 'true' } : extra;
}

async function uploadToBucket(file, folder = 'applications') {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const path = import.meta.env.VITE_STORAGE_UPLOAD_URL || '/api/upload/upload';
  const endpoint = path.startsWith('http') ? path : `${base}${path}`;
  const uploader = import.meta.env.VITE_STORAGE_UPLOADER || 'application-form';
  const room = `${folder}-${new Date().toISOString().slice(0, 10)}`;

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('room', room);
  formData.append('uploader', uploader);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: tunnelSafeHeaders(),
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }

  const payload = await response.json();
  const fileName = payload?.file?.filename;
  const publicBase = import.meta.env.VITE_STORAGE_PUBLIC_BASE_URL || '/uploads';
  return fileName ? `${publicBase}/${fileName}` : '';
}

function Progress({ step }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between text-xs font-semibold text-remo-muted">
        <span className="text-remo-ink">
          Step <span className="text-remo-blue">{step}</span> of 4
        </span>
        <span className="rounded-full bg-remo-yellow-soft/80 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
          Teaching application
        </span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/80 shadow-inner ring-1 ring-slate-200/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-remo-green via-remo-blue to-remo-yellow transition-all duration-500 ease-out"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>
    </div>
  );
}

function VideoRecorderCard({ title, description, onUploaded, uploadFolder, uploadedUrl }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const autoStopRef = useRef(null);

  const {
    status,
    startRecording,
    stopRecording,
    mediaBlobUrl,
    clearBlobUrl,
    previewStream,
    error: recorderError
  } = useReactMediaRecorder({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: true,
    blobPropertyBag: { type: 'video/webm' }
  });

  const isRecording = status === 'recording';
  const canUpload = useMemo(() => Boolean(mediaBlobUrl) && !uploading, [mediaBlobUrl, uploading]);

  useEffect(() => {
    if (status === 'recording') {
      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, 2 * 60 * 1000);
    } else if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    return () => {
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
        autoStopRef.current = null;
      }
    };
  }, [status, stopRecording]);

  useEffect(() => {
    if (status === 'stopped' || status === 'idle') {
      stopMediaStream(previewStream);
    }
  }, [status, previewStream]);

  const handleStop = () => {
    stopRecording();
    window.setTimeout(() => stopMediaStream(previewStream), 80);
  };

  const handleClear = () => {
    stopMediaStream(previewStream);
    clearBlobUrl();
  };

  const handleUpload = async () => {
    if (!mediaBlobUrl) return;
    setUploading(true);
    setUploadError('');
    try {
      const blob = await fetch(mediaBlobUrl).then((r) => r.blob());
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'video/webm' });
      const url = await uploadToBucket(file, uploadFolder);
      onUploaded(url);
    } catch (error) {
      setUploadError(error.message || 'Failed to upload video.');
    } finally {
      setUploading(false);
    }
  };

  const showLivePreview =
    (status === 'recording' || status === 'acquiring_media') &&
    previewStream &&
    previewStream.getVideoTracks().some((t) => t.readyState === 'live');

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-remo ring-1 ring-remo-blue/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-remo-ink">{title}</h3>
          <p className="mt-1 text-sm text-remo-muted">{description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
            isRecording
              ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {isRecording ? 'Recording' : status.replace(/_/g, ' ')}
        </span>
      </div>

      <div
        className={`relative mt-4 overflow-hidden rounded-xl border-2 ${
          isRecording
            ? 'remo-rec-frame border-red-500'
            : 'border-dashed border-remo-green/30 bg-gradient-to-br from-teal-50/80 via-blue-50/50 to-amber-50/60'
        }`}
      >
        {isRecording && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
            <span className="remo-rec-dot inline-block h-2.5 w-2.5 rounded-full bg-white" aria-hidden />
            Rec
          </div>
        )}
        {showLivePreview ? (
          <LiveVideoPreview
            stream={previewStream}
            className="aspect-video w-full bg-slate-900 object-cover"
          />
        ) : mediaBlobUrl ? (
          <video controls src={mediaBlobUrl} className="aspect-video w-full bg-slate-900 object-cover" />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-teal-50/80 via-blue-50/50 to-amber-50/60 px-4 text-center">
            <span className="text-3xl" aria-hidden>
              📹
            </span>
            <p className="text-sm font-medium text-remo-ink">Camera preview</p>
            <p className="max-w-sm text-xs text-remo-muted">
              Press <strong className="text-remo-blue">Start recording</strong> to open your camera and microphone.
              Allow access when your browser asks. The camera turns off when you press Stop.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startRecording}
          disabled={status === 'recording' || status === 'acquiring_media'}
          className="rounded-lg bg-gradient-to-r from-remo-green to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start recording
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={status !== 'recording' && status !== 'paused'}
          className="rounded-lg border-2 border-remo-blue/40 bg-white px-4 py-2.5 text-sm font-semibold text-remo-blue hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Clear clip
        </button>
      </div>

      <p className="mt-2 text-xs text-remo-muted">Recording auto-stops at 2:00. Review locally, then upload.</p>

      {recorderError && recorderError !== '' && (
        <p className="mt-2 text-sm font-medium text-amber-800">
          Camera/mic: {recorderError}. Check browser permissions and try again.
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
            canUpload
              ? 'bg-gradient-to-r from-remo-blue to-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'cursor-not-allowed bg-slate-300 text-slate-500 shadow-none'
          }`}
        >
          {uploading ? 'Uploading...' : 'Upload video lesson'}
        </button>
        {!mediaBlobUrl && (
          <p className="mt-2 text-xs text-remo-muted">Record a clip first. Upload stays gray until a local file is ready.</p>
        )}
      </div>

      {uploadedUrl && (
        <p className="mt-2 text-xs font-medium text-teal-700">Video lesson uploaded.</p>
      )}
      {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}

function AudioRecorderCard({ title, description, onUploaded, uploadFolder, uploadedUrl }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl, error: audioRecorderError } =
    useReactMediaRecorder({
      video: false,
      audio: true,
      blobPropertyBag: { type: 'audio/webm' }
    });

  const canUpload = useMemo(() => Boolean(mediaBlobUrl) && !uploading, [mediaBlobUrl, uploading]);

  const handleUpload = async () => {
    if (!mediaBlobUrl) return;
    setUploading(true);
    setUploadError('');
    try {
      const blob = await fetch(mediaBlobUrl).then((r) => r.blob());
      const file = new File([blob], `voice-answer-${Date.now()}.webm`, { type: 'audio/webm' });
      const url = await uploadToBucket(file, uploadFolder);
      onUploaded(url);
    } catch (error) {
      setUploadError(error.message || 'Failed to upload audio.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-remo ring-1 ring-remo-green/10">
      <h3 className="text-base font-bold text-remo-ink">{title}</h3>
      <p className="mt-1 text-sm text-remo-muted">{description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startRecording}
          disabled={status === 'recording' || status === 'acquiring_media'}
          className="rounded-lg bg-gradient-to-r from-remo-green to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20 disabled:opacity-50"
        >
          Start
        </button>
        <button
          type="button"
          onClick={stopRecording}
          disabled={status !== 'recording' && status !== 'paused'}
          className="rounded-lg border-2 border-remo-blue/40 bg-white px-4 py-2.5 text-sm font-semibold text-remo-blue hover:bg-blue-50 disabled:opacity-40"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={clearBlobUrl}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-remo-muted">
        Status: {status.replace(/_/g, ' ')}
      </p>

      {audioRecorderError && (
        <p className="mt-2 text-sm font-medium text-amber-800">Microphone: {audioRecorderError}</p>
      )}

      {mediaBlobUrl && (
        <audio controls src={mediaBlobUrl} className="mt-4 w-full rounded-lg border border-slate-200" />
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${
            canUpload
              ? 'bg-gradient-to-r from-remo-yellow to-amber-500 text-amber-950 shadow-md shadow-amber-500/25'
              : 'cursor-not-allowed bg-slate-300 text-slate-500 shadow-none'
          }`}
        >
          {uploading ? 'Uploading...' : 'Upload voice answer'}
        </button>
        {!mediaBlobUrl && (
          <p className="mt-2 text-xs text-remo-muted">Record first. This button stays gray until a local clip exists.</p>
        )}
      </div>

      {uploadedUrl && <p className="mt-2 text-xs font-medium text-teal-700">Voice answer uploaded.</p>}
      {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [touched, setTouched] = useState({ fullName: false, email: false, contactNo: false });
  const [docFiles, setDocFiles] = useState({ nationalId: null, nbi: null });

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const setQuestionText = (index, value) =>
    setForm((prev) => {
      const clone = [...prev.testAnswers];
      clone[index] = value;
      return { ...prev, testAnswers: clone };
    });

  const setQuestionVideo = (index, url) =>
    setForm((prev) => {
      const clone = [...prev.testVideos];
      clone[index] = url;
      return { ...prev, testVideos: clone };
    });

  const nameError = touched.fullName && !isValidName(form.fullName) ? 'Enter your full name (at least 2 characters).' : '';
  const emailError = touched.email && !isValidEmail(form.email) ? 'Enter a valid email address.' : '';
  const contactError =
    touched.contactNo && !isValidContact(form.contactNo) ? 'Enter a valid contact number (at least 10 digits).' : '';

  const step1Valid = isValidName(form.fullName) && isValidEmail(form.email) && isValidContact(form.contactNo);
  const step2Valid = form.testVideos.every(Boolean);
  const step3Valid = Boolean(form.demoVideoUrl);
  const step4Valid = Boolean(docFiles.nationalId && docFiles.nbi);

  const canContinue =
    (step === 1 && step1Valid) || (step === 2 && step2Valid) || (step === 3 && step3Valid);

  const continueHint =
    step === 1 && !step1Valid
      ? 'Complete name, email, and contact number to continue.'
      : step === 2 && !step2Valid
        ? 'Record and upload all three voice answers to continue.'
        : step === 3 && !step3Valid
          ? 'Record and upload your 2-minute video lesson to continue.'
          : '';

  const markStep1Touched = () => setTouched({ fullName: true, email: true, contactNo: true });

  const goBack = () => {
    if (step === 1) {
      window.location.assign('/');
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const goContinue = () => {
    if (step === 1) {
      markStep1Touched();
      if (!step1Valid) return;
    }
    if (step === 2 && !step2Valid) return;
    if (step === 3 && !step3Valid) return;
    setStep((s) => Math.min(4, s + 1));
  };

  const submitApplication = async () => {
    markStep1Touched();
    if (!step1Valid || !step2Valid || !step3Valid || !step4Valid) {
      alert('Please complete all required fields and uploads before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const nationalIdUrl = await uploadToBucket(docFiles.nationalId, 'application-documents');
      const nbiUrl = await uploadToBucket(docFiles.nbi, 'application-documents');
      const payload = {
        fullName: String(form.fullName).trim(),
        email: String(form.email).trim(),
        contactNo: String(form.contactNo || '').trim(),
        currentStage: 'applied',
        status: true,
        testAnswers: {
          text: form.testAnswers.join('\n\n'),
          videoUrls: form.testVideos.filter(Boolean)
        },
        demoVideoUrl: form.demoVideoUrl,
        uploadedDocuments: {
          nationalId: nationalIdUrl,
          nbi: nbiUrl
        }
      };

      const apiUrl = `${window.location.origin}/api/applications`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: tunnelSafeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      const ct = response.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await response.json().catch(() => ({})) : {};

      if (!response.ok) {
        throw new Error(data.error || `Submission failed (${response.status})`);
      }
      if (data.success !== true) {
        throw new Error(
          data.error ||
            'The server did not confirm your application. If you use ngrok, refresh and try again, or check the console.'
        );
      }

      alert(
        'Thank you for completing your tutor application.\n\n' +
          'We will review your submission and email you with the results. This may take about three days to one week.\n\n' +
          'Click OK to return to the homepage.'
      );
      window.location.replace(`${window.location.origin}/`);
    } catch (error) {
      alert(error.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-remo-blue focus:outline-none focus:ring-2 focus:ring-remo-blue/20';
  const inputErrorClass = 'border-red-400 focus:border-red-500 focus:ring-red-200';

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
      }}
      noValidate
    >
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-10">
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/90 p-6 shadow-remo backdrop-blur-sm md:p-10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-remo-green/20 via-remo-blue/15 to-remo-yellow/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-tr from-remo-blue/10 to-remo-yellow/20 blur-3xl"
          aria-hidden
        />

        <header className="relative mb-8 border-b border-slate-100 pb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-remo-green">RemoEd · Teacher pipeline</p>
          <h1 className="mt-2 bg-gradient-to-r from-remo-ink via-remo-blue to-remo-green bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            Teaching Application
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-remo-muted">
            Complete all four steps. Keep your responses clear, concise, and professional. You’ll use your microphone in
            step 2 and your <span className="font-semibold text-remo-blue">camera</span> for the short demo in step 3.
            Recordings stay on this device until you upload them.
          </p>
        </header>

        <div className="relative">
          <Progress step={step} />
        </div>

        {step === 1 && (
          <section className="relative space-y-5">
            <h2 className="text-lg font-bold text-remo-ink">
              Step 1: <span className="text-remo-blue">Basic info</span> and contact
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                  className={`${inputClass} ${nameError ? inputErrorClass : ''}`}
                  autoComplete="name"
                  required
                />
                {nameError && <p className="mt-1 text-xs font-medium text-red-600">{nameError}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  className={`${inputClass} ${emailError ? inputErrorClass : ''}`}
                  autoComplete="email"
                  required
                />
                {emailError && <p className="mt-1 text-xs font-medium text-red-600">{emailError}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Contact no. <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. +63 9xx xxx xxxx"
                  value={form.contactNo}
                  onChange={(e) => setField('contactNo', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, contactNo: true }))}
                  className={`${inputClass} ${contactError ? inputErrorClass : ''}`}
                  required
                />
                {contactError && <p className="mt-1 text-xs font-medium text-red-600">{contactError}</p>}
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="relative space-y-5">
            <h2 className="text-lg font-bold text-remo-ink">
              Step 2: <span className="text-remo-green">Pedagogical</span> voice answers
            </h2>
            <p className="text-sm text-remo-muted">
              Record each answer on this device first, then upload. Continue stays disabled until all three are uploaded.
            </p>
            <div className="space-y-4">
              {PEDAGOGICAL_QUESTIONS.map((question, idx) => (
                <div
                  key={question}
                  className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-teal-50/30 p-4 shadow-sm"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    Q{idx + 1}. {question}
                  </p>
                  <textarea
                    placeholder="Optional written summary..."
                    value={form.testAnswers[idx]}
                    onChange={(e) => setQuestionText(idx, e.target.value)}
                    className={`${inputClass} mt-3`}
                    rows={3}
                  />
                  <div className="mt-4">
                    <AudioRecorderCard
                      title={`Record Voice Answer ${idx + 1}`}
                      description="Use microphone only. The clip stays on your device until you upload."
                      uploadFolder={`application-question-${idx + 1}`}
                      uploadedUrl={form.testVideos[idx]}
                      onUploaded={(url) => setQuestionVideo(idx, url)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="relative space-y-5">
            <h2 className="text-lg font-bold text-remo-ink">
              Step 3: <span className="text-remo-yellow">2-minute</span> lesson demo (camera)
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <aside className="rounded-2xl border border-remo-blue/20 bg-gradient-to-b from-blue-50/80 to-white p-4 md:col-span-1">
                <p className="text-xs font-bold uppercase tracking-wide text-remo-blue">Teaching scenario</p>
                <div className="mt-2 text-sm text-slate-800">
                  <p className="font-semibold">Scenario Title:</p>
                  <p>{TEACHING_SCENARIO.title}</p>
                  <p className="mt-2 font-semibold">Goal:</p>
                  <p>{TEACHING_SCENARIO.goal}</p>
                  <p className="mt-3 font-semibold">Instructions for the Teacher:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {TEACHING_SCENARIO.instructions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </aside>
              <div className="md:col-span-2">
                <VideoRecorderCard
                  title="Record Demo Lesson (Up to 2 minutes)"
                  description="Record locally first. The camera turns off when you press Stop. Then upload your video lesson."
                  uploadFolder="application-demo"
                  uploadedUrl={form.demoVideoUrl}
                  onUploaded={(url) => setField('demoVideoUrl', url)}
                />
              </div>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="relative space-y-5">
            <h2 className="text-lg font-bold text-remo-ink">
              Step 4: <span className="text-remo-blue">Document</span> upload
            </h2>
            <p className="text-sm text-remo-muted">
              Choose files on this device. They upload to storage only when you submit the application.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  National ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) =>
                    setDocFiles((prev) => ({ ...prev, nationalId: e.target.files?.[0] || null }))
                  }
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-remo-green file:to-teal-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"
                />
                {docFiles.nationalId && (
                  <p className="mt-2 text-xs font-medium text-teal-700">Ready on this device: {docFiles.nationalId.name}</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  NBI Clearance <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setDocFiles((prev) => ({ ...prev, nbi: e.target.files?.[0] || null }))}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-remo-blue file:to-blue-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"
                />
                {docFiles.nbi && (
                  <p className="mt-2 text-xs font-medium text-teal-700">Ready on this device: {docFiles.nbi.name}</p>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="relative mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-remo-blue/40 hover:text-remo-blue"
          >
            Back
          </button>

          <div className="flex flex-col items-end gap-2">
            {step < 4 ? (
              <>
                <button
                  type="button"
                  onClick={goContinue}
                  disabled={!canContinue}
                  className="rounded-xl bg-gradient-to-r from-remo-ink via-slate-800 to-remo-blue px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  Continue
                </button>
                {continueHint && <p className="max-w-xs text-right text-xs text-remo-muted">{continueHint}</p>}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={submitApplication}
                  disabled={submitting || !step4Valid}
                  className="rounded-xl bg-gradient-to-r from-remo-green to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-600/25 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {submitting ? 'Submitting...' : 'Submit application'}
                </button>
                {!step4Valid && (
                  <p className="max-w-xs text-right text-xs text-remo-muted">
                    Attach National ID and NBI Clearance to submit.
                  </p>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
    </form>
  );
}
