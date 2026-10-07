import type { Metadata } from "next";
import EventOrdering from "@/components/event/EventOrdering";

// Protected school-event ordering page. The link alone is not the security
// control: the access code is checked on the server and every order is
// validated there. The page is also kept out of search engines.
export const metadata: Metadata = {
  title: "School Event Ordering | The Club Boils",
  description: "Private pre-order page for a Club Boils school event.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  alternates: { canonical: null },
  openGraph: null,
};

export default async function SchoolOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EventOrdering slug={slug} />;
}
