import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.js"
import { ClerkProvider } from "@clerk/react"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ClerkProvider>
			<App />
		</ClerkProvider>
	</StrictMode>,
)
