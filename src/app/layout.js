import "./globals.css"
import { UserProvider } from "./context/UserContext"

export const metadata = {
  title: "Mercy MUHCS Tracker",
  description: "Mercy Hospital MUHCS Billing Tracker",
  icons: {
    icon: "/favicon.png",
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  )
}