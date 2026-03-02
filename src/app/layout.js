import "./globals.css"
import { UserProvider } from "./context/UserContext"

export const metadata = {
  title: "MUHCS Tracker",
  description: "Mercy Hospital MUHCS Billing Tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MUHCS Tracker",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.jpg",
  },
}

export const viewport = {
  themeColor: "#111827",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MUHCS Tracker" />
        <meta name="theme-color" content="#111827" />
      </head>
      <body>
        <UserProvider>
          {children}
        </UserProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
            })
          }
        `}} />
      </body>
    </html>
  )
}