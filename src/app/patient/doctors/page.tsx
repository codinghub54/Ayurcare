'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Loader2, Search, Star, ShieldCheck, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import BookingModal from '@/components/booking/BookingModal';
import { getConsultFees, CONSULT_TYPES, CONSULT_TYPE_LABELS } from '@/lib/doctor-fees';

type ConsultType = 'VIDEO' | 'AUDIO' | 'CHAT';

export default function FindAndBookDoctor() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [specFilter, setSpecFilter] = useState('');

  // Booking modal; prefill comes from AyurBot links: ?doctor=<id>&date=YYYY-MM-DD&time=HH:MM&type=VIDEO
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [prefill, setPrefill] = useState<{ type?: ConsultType; date?: string; time?: string }>({});
  const prefillApplied = useRef(false);

  // Result when returning to this page with ?checkout=<appointmentId> (e.g. after a payment redirect)
  const [returnStatus, setReturnStatus] = useState<'checking' | 'confirmed' | 'processing' | 'failed' | null>(null);

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/patient/doctors');
      if (res.ok) {
        const json = await res.json();
        setDoctors(json.doctors);
      }
    } catch (e) {
      console.error('Failed to load doctors directory:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    if (prefillApplied.current || doctors.length === 0) return;
    const doctorId = searchParams.get('doctor');
    if (!doctorId) return;
    prefillApplied.current = true;
    const doc = doctors.find((d) => d.id === doctorId);
    if (!doc) return;
    const type = searchParams.get('type');
    setPrefill({
      type: type === 'VIDEO' || type === 'AUDIO' || type === 'CHAT' ? type : undefined,
      date: searchParams.get('date') || undefined,
      time: searchParams.get('time') || undefined,
    });
    setSelectedDoctor(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors]);

  useEffect(() => {
    const appointmentId = searchParams.get('checkout');
    if (!appointmentId) return;
    let cancelled = false;
    (async () => {
      setReturnStatus('checking');
      try {
        const res = await fetch('/api/patient/checkout/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setReturnStatus(data.status === 'confirmed' ? 'confirmed' : data.status === 'processing' ? 'processing' : 'failed');
      } catch {
        if (!cancelled) setReturnStatus('failed');
      }
      router.replace('/patient/doctors');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredDoctors = doctors.filter((doc) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = doc.name?.toLowerCase().includes(term) || 
                          doc.doctorProfile?.specializations?.toLowerCase().includes(term);
    const matchesSpec = specFilter === '' || doc.doctorProfile?.specializations?.includes(specFilter);
    return matchesSearch && matchesSpec;
  });

  return (
    <div className="space-y-8 animate-fadeIn text-slate-800 font-sans" id="find-doctors-page">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-wide text-slate-850">Book a Consultation</h1>
        <p className="text-slate-500 text-sm mt-1">Consult approved Ayurvedic physicians online by video, audio or chat.</p>
      </div>

      {returnStatus && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${
            returnStatus === 'failed' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {returnStatus === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : returnStatus === 'failed' ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {returnStatus === 'checking' && 'Checking your payment…'}
            {returnStatus === 'confirmed' && 'Payment received. Your consultation is booked.'}
            {returnStatus === 'processing' && 'Your payment is processing. The booking will confirm automatically.'}
            {returnStatus === 'failed' && 'The payment was not completed, so no booking was made. You can try again.'}
          </span>
          {(returnStatus === 'confirmed' || returnStatus === 'processing') && (
            <Link href="/patient/dashboard" className="font-semibold underline">
              Go to dashboard
            </Link>
          )}
        </div>
      )}

      {/* Filters */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-slate-100 rounded-xl p-5 shadow-sm items-end">
        <div className="space-y-2">
          <label htmlFor="search-inp" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Search Doctor / Specialty</label>
          <div className="relative">
            <input
              id="search-inp"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or specialisation…"
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-primary-600 focus:outline-none"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="spec-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Specialization</label>
          <select
            id="spec-select"
            value={specFilter}
            onChange={(e) => setSpecFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm bg-white"
          >
            <option value="">All Specialities</option>
            <option value="Kayachikitsa">Kayachikitsa (General Medicine)</option>
            <option value="Panchakarma">Panchakarma (Detoxification)</option>
            <option value="Shalya Tantra">Shalya Tantra (Surgery)</option>
          </select>
        </div>
      </section>

      {/* Doctor directory grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold flex items-center justify-center space-x-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          <span>Vetting doctor database...</span>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl p-12 text-center text-slate-400 shadow-sm">
          <h3 className="font-bold text-lg text-slate-700">No Doctors Found</h3>
          <p className="text-xs mt-1">Try relaxing your search terms or specialization filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDoctors.map((doc) => {
            const profile = doc.doctorProfile || {};
            return (
              <div key={doc.id} className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display font-bold text-lg text-slate-850">{doc.name}</h3>
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verified
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">{profile.qualification}</span>
                  
                  <div className="flex items-center space-x-1 text-gold-600 mt-1">
                    <Star className="w-4 h-4 fill-gold-600" />
                    <span className="text-xs font-bold text-slate-700">{profile.avgRating > 0 ? Number(profile.avgRating).toFixed(1) : 'New — no ratings yet'}</span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    <div>
                      <strong className="text-slate-800">Specialities:</strong> {profile.specializations}
                    </div>
                    <div>
                      <strong className="text-slate-800">Experience:</strong> {profile.experienceYears} Years
                    </div>
                    <div>
                      <strong className="text-slate-800">Languages:</strong> {profile.languages}
                    </div>
                  </div>

                  {profile.bio && (
                    <p className="text-[11px] text-slate-400 mt-3 italic line-clamp-3">"{profile.bio}"</p>
                  )}
                </div>

                <div className="border-t border-slate-50 mt-6 pt-4 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Consultation fees</span>
                    {(() => {
                      const fees = getConsultFees(profile);
                      return CONSULT_TYPES.filter((t) => fees[t] !== null).map((t) => (
                        <div key={t} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="w-10">{CONSULT_TYPE_LABELS[t]}</span>
                          <strong className="text-sm font-bold text-slate-800">₹{(fees[t] as number).toLocaleString('en-IN')}</strong>
                        </div>
                      ));
                    })()}
                  </div>
                  <button
                    onClick={() => setSelectedDoctor(doc)}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Book
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking & payment */}
      {selectedDoctor && (
        <BookingModal
          doctor={selectedDoctor}
          initialType={prefill.type}
          initialDate={prefill.date}
          initialTime={prefill.time}
          onClose={() => {
            setSelectedDoctor(null);
            setPrefill({});
          }}
        />
      )}
    </div>
  );
}
