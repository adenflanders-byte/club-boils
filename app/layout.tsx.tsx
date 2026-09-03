export const metadata = {
  title: "The Club Boils | Seafood Boils in Trinidad",
  description: "Order premium seafood boils, ramen and wings from The Club Boils in Arima, Trinidad. Open Thursday, Friday and Saturday for pickup and delivery.",
  metadataBase: new URL("https://www.theclubboils.com"),
  alternates: { canonical: "https://www.theclubboils.com/" },
  openGraph: {
    title: "The Club Boils | Seafood Boils in Trinidad",
    description: "Order premium seafood boils, ramen and wings from The Club Boils in Arima, Trinidad. Open Thursday, Friday and Saturday for pickup and delivery.",
    url: "https://www.theclubboils.com/",
    siteName: "The Club Boils",
    images: [{ url: "/spread2.jpeg", width: 1200, height: 630, alt: "The Club Boils — Premium Seafood Boils in Trinidad" }],
    locale: "en_TT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Club Boils | Seafood Boils in Trinidad",
    description: "Order premium seafood boils, ramen and wings from The Club Boils in Arima, Trinidad.",
    images: ["/spread2.jpeg"],
  },
  robots: { index: true, follow: true },
  keywords: ["seafood boil", "Trinidad", "Arima", "shrimp", "crab", "ramen", "wings", "delivery", "pickup"],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#C4952A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FoodEstablishment",
              "name": "The Club Boils",
              "description": "Premium seafood boils, ramen and wings in Arima, Trinidad.",
              "url": "https://www.theclubboils.com",
              "telephone": "+1-868-293-0570",
              "address": { "@type": "PostalAddress", "addressLocality": "Arima", "addressCountry": "TT" },
              "openingHours": ["Th 12:00-18:00", "Fr 12:00-18:00", "Sa 12:00-18:00"],
              "servesCuisine": "Seafood",
              "priceRange": "TT$60–TT$320",
              "sameAs": ["https://www.instagram.com/theclub.boils"],
            }),
          }}
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
