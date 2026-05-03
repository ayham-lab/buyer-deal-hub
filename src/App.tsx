import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Buyers from "./pages/Buyers";
import Finder from "./pages/Finder";
import Pipeline from "./pages/Pipeline";
import KPIs from "./pages/KPIs";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import TitleCompanies from "./pages/TitleCompanies";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/buyers" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/buyers" element={<Buyers />} />
            <Route path="/finder" element={<Finder />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/kpis" element={<KPIs />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/title-companies" element={<TitleCompanies />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
