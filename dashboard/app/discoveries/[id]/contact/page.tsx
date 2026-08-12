import { ContactBusinessPanel } from './contact-business-panel';

export default async function ContactBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="max-w-2xl mx-auto p-5 md:p-8">
      <ContactBusinessPanel contentItemId={id} />
    </main>
  );
}
