import { NextResponse } from 'next/server';
import { HERBS } from '@/app/patient/remedies/herb-data';

const herbs = HERBS.map((h) => ({
  ...h,
  id: h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
}));

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const dosha = searchParams.get('dosha') || 'All';
    const page = parseInt(searchParams.get('page') || '1', 10) || 1;
    const limit = Math.min(48, Math.max(1, parseInt(searchParams.get('limit') || '24', 10) || 24));

    let filtered = herbs;

    if (dosha === 'Vata' || dosha === 'Pitta' || dosha === 'Kapha') {
      filtered = filtered.filter((h) => h.balances.includes(dosha));
    }

    if (search) {
      filtered = filtered.filter(
        (h) =>
          h.name.toLowerCase().includes(search) ||
          h.hindiName.toLowerCase().includes(search) ||
          h.scientificName.toLowerCase().includes(search) ||
          h.sanskritName.toLowerCase().includes(search) ||
          h.category.toLowerCase().includes(search) ||
          h.desc.toLowerCase().includes(search) ||
          h.diseases.some((d) => d.toLowerCase().includes(search)) ||
          h.benefits.some((b) => b.toLowerCase().includes(search)) ||
          h.formulations.some((f) => f.toLowerCase().includes(search))
      );
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * limit;

    return NextResponse.json({
      totalCount: total,
      libraryCount: herbs.length,
      totalPages,
      currentPage,
      limit,
      herbs: filtered.slice(startIndex, startIndex + limit),
    });
  } catch (error: any) {
    console.error('Fetch herb remedies error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
