import type { Metadata } from "next";
import { decodeCard } from "@/lib/cardId";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = decodeCard(params.id);
  if (!card) return { title: "HH Goa 2026" };

  const title = "I'm building at HH Goa 2026 🌴";
  const description = "Made with the HH Goa 2026 Frame Generator. #FrameInGoa";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: card.ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [card.ogUrl],
    },
  };
}

export default function CardPage({ params }: Props) {
  const imageUrl = decodeCard(params.id)?.imageUrl;
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
        background: "#0b5c39",
        color: "#f6f0de",
        fontFamily: "monospace",
        textAlign: "center",
      }}
    >
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="HH Goa 2026 frame" style={{ maxWidth: 420, width: "100%", borderRadius: 16 }} />
          <a
            href="/"
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              background: "#f4d913",
              color: "#0b5c39",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Make your own frame →
          </a>
        </>
      ) : (
        <p>Card not found.</p>
      )}
    </main>
  );
}
