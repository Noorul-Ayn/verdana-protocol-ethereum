import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./wallet/WalletContext.jsx";
import { ProgrammeProvider } from "./wallet/ProgrammeContext.jsx";
import { Layout } from "./components/Layout.jsx";
import { Overview } from "./pages/Overview.jsx";
import { Farms } from "./pages/Farms.jsx";
import { Verifier } from "./pages/Verifier.jsx";
import { Farmer } from "./pages/Farmer.jsx";
import { Market } from "./pages/Market.jsx";
import { Admin } from "./pages/Admin.jsx";

// HashRouter (#/farms) works on any static host, such as GitHub Pages, without server rewrites.
export function App() {
  return (
    <WalletProvider>
      <ProgrammeProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="farms" element={<Farms />} />
              <Route path="verify" element={<Verifier />} />
              <Route path="farmer" element={<Farmer />} />
              <Route path="market" element={<Market />} />
              <Route path="admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </ProgrammeProvider>
    </WalletProvider>
  );
}
