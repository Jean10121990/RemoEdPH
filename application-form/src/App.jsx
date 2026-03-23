import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';

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
  password: '',
  testAnswers: ['', '', ''],
  testVideos: ['', '', ''],
  demoVideoUrl: '',
  documents: {
    nationalId: '',
    nbi: ''
  }
};

async function uploadToBucket(file, folder = 'applications') {
  const endpoint = import.meta.env.VITE_STORAGE_UPLOAD_URL || '/api/upload/upload';
  const uploader = import.meta.env.VITE_STORAGE_UPLOADER || 'application-form';
  const room = `${folder}-${new Date().toISOString().slice(0, 10)}`;

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('room', room);
  formData.append('uploader', uploader);

  const response = await fetch(endpoint, {
    method: 'POST',
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
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>Step {step} of 4</span>
        <span>Application</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-slate-900 transition-all"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>
    </div>
  );
}

function VideoRecorderCard({ title, description, onUploaded, uploadFolder }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const autoStopRef = useRef(null);

  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl } =
    useReactMediaRecorder({
      video: true,
      audio: true,
      blobPropertyBag: { type: 'video/webm' }
    });

  useEffect(() => {
    if (status === 'recording') {
      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, 2 * 60 * 1000); // 2 minutes
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

  const canUpload = useMemo(() => Boolean(mediaBlobUrl) && !uploading, [mediaBlobUrl, uploading]);

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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startRecording}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start
        </button>
        <button
          type="button"
          onClick={stopRecording}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={clearBlobUrl}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Recorder: {status}</p>
      <p className="mt-1 text-xs text-slate-500">Auto-stops at 2:00.</p>

      {mediaBlobUrl && (
        <video controls src={mediaBlobUrl} className="mt-4 w-full rounded-lg border border-slate-200" />
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {uploading ? 'Uploading...' : 'Upload to Bucket'}
        </button>
      </div>

      {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}

function AudioRecorderCard({ title, description, onUploaded, uploadFolder }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl } =
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startRecording}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start
        </button>
        <button
          type="button"
          onClick={stopRecording}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={clearBlobUrl}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Recorder: {status}</p>

      {mediaBlobUrl && (
        <audio controls src={mediaBlobUrl} className="mt-4 w-full rounded-lg border border-slate-200" />
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {uploading ? 'Uploading...' : 'Upload Voice Answer'}
        </button>
      </div>

      {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

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

  const uploadDocument = async (field, file) => {
    if (!file) return;
    const url = await uploadToBucket(file, 'application-documents');
    setForm((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [field]: url
      }
    }));
  };

  const submitApplication = async () => {
    setSubmitting(true);
    try {
      const payload = {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        currentStage: 'applied',
        status: true,
        testAnswers: {
          text: form.testAnswers.join('\n\n'),
          videoUrls: form.testVideos.filter(Boolean)
        },
        demoVideoUrl: form.demoVideoUrl,
        uploadedDocuments: {
          nationalId: form.documents.nationalId,
          nbi: form.documents.nbi
        }
      };

      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Submission failed (${response.status})`);
      }

      alert('Application submitted successfully.');
      setForm(initialForm);
      setStep(1);
    } catch (error) {
      alert(error.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Teaching Application</h1>
          <p className="mt-2 text-sm text-slate-600">
            Complete all four steps. Keep your responses clear, concise, and professional.
          </p>
        </header>

        <Progress step={step} />

        {step === 1 && (
          <section className="space-y-5">
            <h2 className="text-lg font-medium text-slate-900">Step 1: Basic Info and Account</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  value={form.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <h2 className="text-lg font-medium text-slate-900">Step 2: Pedagogical Voice Answers</h2>
            <p className="text-sm text-slate-600">
              Record one voice answer per question, then upload each recording to your bucket.
            </p>
            <div className="space-y-4">
              {PEDAGOGICAL_QUESTIONS.map((question, idx) => (
                <div key={question} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-800">
                    Q{idx + 1}. {question}
                  </p>
                  <textarea
                    placeholder="Optional written summary..."
                    value={form.testAnswers[idx]}
                    onChange={(e) => setQuestionText(idx, e.target.value)}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    rows={3}
                  />
                  <div className="mt-4">
                    <AudioRecorderCard
                      title={`Record Voice Answer ${idx + 1}`}
                      description="Use microphone only and upload when done."
                      uploadFolder={`application-question-${idx + 1}`}
                      onUploaded={(url) => setQuestionVideo(idx, url)}
                    />
                  </div>
                  {form.testVideos[idx] && (
                    <p className="mt-2 text-xs text-emerald-700">Uploaded URL: {form.testVideos[idx]}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-5">
            <h2 className="text-lg font-medium text-slate-900">Step 3: Quick 2-Minute Lesson Demo</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teaching Scenario</p>
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
                  description="After recording, upload the demo video to your storage bucket."
                  uploadFolder="application-demo"
                  onUploaded={(url) => setField('demoVideoUrl', url)}
                />
                {form.demoVideoUrl && (
                  <p className="mt-2 text-xs text-emerald-700">Uploaded URL: {form.demoVideoUrl}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-5">
            <h2 className="text-lg font-medium text-slate-900">Step 4: Document Upload</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">National ID</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => uploadDocument('nationalId', e.target.files?.[0])}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                {form.documents.nationalId && (
                  <p className="mt-2 text-xs text-emerald-700">Uploaded URL: {form.documents.nationalId}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">NBI Clearance</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => uploadDocument('nbi', e.target.files?.[0])}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                {form.documents.nbi && <p className="mt-2 text-xs text-emerald-700">Uploaded URL: {form.documents.nbi}</p>}
              </div>
            </div>
          </section>
        )}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>

          <div className="flex gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={submitApplication}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
