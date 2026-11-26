'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Stethoscope, AlertCircle, UploadCloud, Camera, Check, User } from 'lucide-react';
import AuthShell, { authInput, authLabel, authPrimaryButton } from '@/components/auth/AuthShell';
import FeeFields, { emptyFeeState, feePayload, type FeeFormState } from '@/components/doctor/FeeFields';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function compressImageFile(file: File, maxWidth = 800, maxHeight = 1000, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      readFileAsDataUrl(file).then(resolve);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export default function DoctorSignup() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [qualification, setQualification] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [specializations, setSpecializations] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [fees, setFees] = useState<FeeFormState>(emptyFeeState());
  const errorRef = useRef<HTMLDivElement>(null);
  const [clinicAddress, setClinicAddress] = useState('');
  const [languages, setLanguages] = useState('English, Hindi');

  const [uploadName, setUploadName] = useState('');
  const [uploadDataUrl, setUploadDataUrl] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  
  const [capturedImage, setCapturedImage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Ensure webcam stream is attached as soon as video element is rendered
  useEffect(() => {
    if (cameraActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [cameraActive, stream]);

  const startCamera = async () => {
    setCapturedImage('');
    setError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 480, facingMode: 'user' },
      });
      setStream(mediaStream);
      setCameraActive(true);
    } catch (err) {
      setError('Could not access your webcam. Please allow camera permissions or upload your photo.');
    }
  };

  const retakePhoto = () => {
    setCapturedImage('');
    startCamera();
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      const width = 360;
      const height = 450;

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (context) {
        context.translate(width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        if (base64 && base64.length > 100) {
          setCapturedImage(base64);
        }
        stopCamera();
      }
    }
  };

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | ''>('');

  // Password strength check
  useEffect(() => {
    if (!password) {
      setPasswordStrength('');
      return;
    }

    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const isLongEnough = password.length >= 8;

    if (isLongEnough && hasNumber && hasSymbol) {
      setPasswordStrength('strong');
    } else if (password.length >= 6 && (hasNumber || hasSymbol)) {
      setPasswordStrength('medium');
    } else {
      setPasswordStrength('weak');
    }
  }, [password]);

  /** Show a validation problem next to the submit button and bring it into view. */
  const fail = (message: string) => {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Field checks
    if (!name.trim() || !email.trim() || !phone.trim()) return fail('Please enter your name, email and phone number.');
    if (!/^\+?[0-9\s-]{10,15}$/.test(phone.trim())) return fail('Please enter a valid phone number (10 digits, optionally with +91).');
    if (!qualification) return fail('Please select your highest qualification.');
    if (!regNumber.trim()) return fail('Please enter your medical registration number.');
    if (!specializations.trim()) return fail('Please enter at least one area of specialisation.');
    if (experienceYears === '' || Number(experienceYears) < 0 || Number(experienceYears) > 70) {
      return fail('Please enter your years of experience (0 to 70).');
    }
    const feeResult = feePayload(fees);
    if ('error' in feeResult) return fail(feeResult.error);
    if (passwordStrength !== 'strong') {
      return fail('Your password needs at least 8 characters, including a number and a symbol (for example ! @ # - _).');
    }
    if (password !== confirmPassword) return fail('The two passwords do not match.');
    if (!uploadName || !uploadDataUrl) return fail('Please upload your licence or degree certificate.');
    const cleanAadhaar = aadhaarNumber.replace(/\s/g, '');
    if (!/^\d{12}$/.test(cleanAadhaar)) return fail('Aadhaar number must be exactly 12 digits.');
    if (!capturedImage) return fail('Please take or upload a clear photo of your face for identity verification.');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
          role: 'DOCTOR',
          doctorDetails: {
            qualification,
            regNumber: regNumber.trim(),
            specializations: specializations.trim(),
            experienceYears: parseInt(experienceYears, 10),
            fees: feeResult.fees,
            clinicAddress,
            languages,
            documents: uploadDataUrl,
            aadhaarNumber: cleanAadhaar,
            faceIdImage: capturedImage,
          },
        }),
      });

      const contentType = res.headers.get('content-type');
      let data: any = {};
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes('Request Entity')) {
          fail('Your uploaded document is too large. Please upload a file under 2 MB (a photo of the certificate works well).');
          return;
        }
        fail(`Server returned an error (${res.status}). Please try again.`);
        return;
      }

      if (res.ok) {
        // Redirect to pending review holding page directly
        router.push('/doctor/pending');
      } else {
        fail(data.error || 'Registration failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Registration fetch error:', err);
      fail('Could not reach the server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthBarColor = () => {
    if (passwordStrength === 'weak') return 'bg-red-500 w-1/3';
    if (passwordStrength === 'medium') return 'bg-yellow-500 w-2/3';
    if (passwordStrength === 'strong') return 'bg-green-600 w-full';
    return 'bg-slate-200 w-0';
  };

  const getStrengthText = () => {
    if (passwordStrength === 'weak') return 'Weak';
    if (passwordStrength === 'medium') return 'Medium';
    if (passwordStrength === 'strong') return 'Strong & Secure!';
    return '';
  };

  return (
    <AuthShell
      wide
      eyebrow="Join as a physician"
      headline="Practise Ayurveda online, on your own schedule."
      points={[
        'Set separate fees for video, audio and chat',
        'Consult patients over in-browser video',
        'Every application is reviewed by our team before approval',
      ]}
    >
      <div id="doctor-signup-page" className="rounded-3xl border border-line bg-white p-6 sm:p-8 shadow-[0_24px_60px_-40px_rgba(18,58,43,0.4)]">
          <div className="mb-6">
            <h2 className="font-display text-3xl font-semibold text-ink">Apply as a physician</h2>
            <p className="mt-2 text-ink-muted">
              Submit your qualifications and registration for review. Already applied?{' '}
              <Link href="/doctor/login" className="font-semibold text-forest hover:underline">Sign in</Link>
            </p>
          </div>


          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-xs font-bold text-forest uppercase tracking-[0.14em] border-b border-line pb-1">1. Account Details</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className={authLabel}>Full Name</label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Full Name"
                  className={`${authInput}`}
                />
              </div>
              <div>
                <label htmlFor="email" className={authLabel}>Email Address</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`${authInput}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phone" className={authLabel}>Phone Number</label>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91"
                  className={`${authInput}`}
                />
              </div>
              <div>
                <label htmlFor="languages" className={authLabel}>Languages Spoken</label>
                <input
                  id="languages"
                  type="text"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="English, Hindi, Sanskrit"
                  className={`${authInput}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="password" className={authLabel}>Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${authInput}`}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className={authLabel}>Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${authInput}`}
                />
              </div>
            </div>

            {/* Password Strength Meter */}
            {password && (
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${getStrengthBarColor()}`}></div>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">8+ characters with a number and a symbol</span>
                  <span className="font-bold uppercase tracking-wider text-slate-700">{getStrengthText()}</span>
                </div>
              </div>
            )}

            <h3 className="text-xs font-bold text-forest uppercase tracking-[0.14em] border-b border-line pt-4 pb-1">2. Professional Medical Credentials</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="qualification" className={authLabel}>Highest Degree / Qualification</label>
                <select
                  id="qualification"
                  required
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  className={`${authInput}`}
                >
                  <option value="">Select Degree</option>
                  <option value="BAMS">BAMS (Bachelor of Ayurvedic Medicine and Surgery)</option>
                  <option value="MD (Ayurveda)">MD (Ayurveda)</option>
                  <option value="BAMS, PhD">BAMS, PhD (Ayurvedic Research)</option>
                  <option value="MS (Ayurveda)">MS (Ayurvedic Surgery)</option>
                </select>
              </div>
              <div>
                <label htmlFor="regNumber" className={authLabel}>Medical Registration Number</label>
                <input
                  id="regNumber"
                  type="text"
                  required
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="As issued by your medical council"
                  className={`${authInput}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="specializations" className={authLabel}>Areas of Specialization</label>
                <input
                  id="specializations"
                  type="text"
                  required
                  value={specializations}
                  onChange={(e) => setSpecializations(e.target.value)}
                  placeholder="e.g., Panchakarma, Kayachikitsa, Shalya Tantra"
                  className={`${authInput}`}
                />
              </div>
              <div>
                <label htmlFor="experience" className={authLabel}>Years of Exp</label>
                <input
                  id="experience"
                  type="number"
                  required
                  min={0}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  placeholder="5"
                  className={`${authInput}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label htmlFor="address" className={authLabel}>Clinic / Hospital Address <span className="font-normal text-ink-muted">(optional)</span></label>
                <input
                  id="address"
                  type="text"
                  value={clinicAddress}
                  onChange={(e) => setClinicAddress(e.target.value)}
                  placeholder="Clinic name, street, city"
                  className={`${authInput}`}
                />
              </div>
            </div>

            <div className="pt-2">
              <span className={authLabel}>Consultation fees (INR)</span>
              <p className="mb-2.5 text-xs text-ink-muted">Set your own fee for each type you offer and untick any type you do not offer. You can change these later.</p>
              <FeeFields value={fees} onChange={setFees} />
            </div>

            <div className="pt-2">
              <label className={authLabel}>Upload Medical Credentials (License / Degree)</label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 transition cursor-pointer relative">
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadName(file.name);
                      const isImage = file.type.startsWith('image/');
                      if (!isImage && file.type !== 'application/pdf') {
                        setError('Please upload a PDF, JPG or PNG file.');
                        setUploadName('');
                        setUploadDataUrl('');
                        return;
                      }
                      // Images are compressed below; PDFs must stay small enough for the upload limit
                      if (!isImage && file.size > 2 * 1024 * 1024) {
                        setError('PDF must be under 2 MB. Tip: upload a photo (JPG or PNG) of the certificate instead.');
                        setUploadName('');
                        setUploadDataUrl('');
                        return;
                      }
                      setError('');
                      const compressed = await compressImageFile(file, 800, 1000, 0.7);
                      setUploadDataUrl(compressed);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <UploadCloud className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <span className="text-xs font-semibold text-primary-600">Click to upload files</span>
                <p className="text-[10px] text-slate-400 mt-1">JPG or PNG photo, or a PDF up to 2 MB</p>
                {uploadName && (
                  <span className="text-xs font-bold text-green-600 block mt-2">✓ Selected: {uploadName}</span>
                )}
              </div>
            </div>

            <h3 className="text-xs font-bold text-forest uppercase tracking-[0.14em] border-b border-line pt-4 pb-1">3. Identity Verification & KYC</h3>

            <div>
              <label htmlFor="aadhaar" className={authLabel}>12-Digit Aadhaar Number</label>
              <input
                id="aadhaar"
                type="text"
                required
                maxLength={14}
                value={aadhaarNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                  setAadhaarNumber(formatted.substring(0, 14));
                }}
                placeholder="1234 5678 9012"
                className={`${authInput}`}
              />
            </div>

            <div className="pt-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-2">Face ID Capture (Oval Camera Scan)</label>
              
              <div className="flex flex-col items-center space-y-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                <div className="relative w-44 h-56 bg-slate-900 rounded-[50%_/_60%_60%_40%_40%] overflow-hidden border-4 border-emerald-500 shadow-xl flex items-center justify-center">
                  {capturedImage ? (
                    <img src={capturedImage} alt="Captured Face ID" className="w-full h-full object-cover animate-fadeIn" />
                  ) : cameraActive ? (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                  ) : (
                    <div className="text-center p-4 text-slate-400">
                      <User className="w-10 h-10 mx-auto mb-2 text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">No Photo Captured</span>
                    </div>
                  )}
                  <div className="absolute inset-0 border-2 border-emerald-400/30 rounded-[50%] pointer-events-none"></div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {!cameraActive ? (
                    <>
                      <button
                        type="button"
                        onClick={capturedImage ? retakePhoto : startCamera}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-750 text-white rounded-lg text-xs font-bold transition flex items-center shadow-sm cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 mr-1.5" />
                        {capturedImage ? 'Retake Photo' : 'Start Camera'}
                      </button>

                      <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition flex items-center shadow-sm cursor-pointer">
                        <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-gold-400" />
                        <span>Upload Face Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const compressed = await compressImageFile(file, 400, 500, 0.7);
                              setCapturedImage(compressed);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Capture Face
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-750 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>

            {error && (
              <div ref={errorRef} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 hover:bg-primary-750 text-white font-bold rounded-lg transition duration-250 flex items-center justify-center disabled:opacity-50 cursor-pointer shadow-md text-sm mt-3"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Submit Practitioner Application
            </button>

            <div className="text-center text-sm font-medium text-slate-600 mt-6">
              Already have an account?{' '}
              <Link href="/doctor/login" className="text-forest font-semibold hover:underline">
                Log in
              </Link>
            </div>
          </form>
      </div>
    </AuthShell>
  );
}
