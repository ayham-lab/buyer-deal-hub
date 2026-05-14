import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { LocationProvider } from "@/contexts/LocationContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import OAuthConsent from "./pages/OAuthConsent";
import OAuthCallback from "./pages/OAuthCallback";
import Embed from "./pages/Embed";
import PublicDeal from "./pages/PublicDeal";
import Dashboard from "./pages/Dashboard";
import Buyers from "./pages/Buyers";

import Finder from "./pages/Finder";
import Pipeline from "./pages/Pipeline";
import KPIs from "./pages/KPIs";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import PipelineMapping from "./pages/settings/PipelineMapping";
import TitleCompanies from "./pages/TitleCompanies";

import Tasks from "./pages/Tasks";
import AcceptInvite from "./pages/AcceptInvite";
import NoAccess from "./pages/NoAccess";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const wrap = (el: JSX.Element) => <ErrorBoundary>{el}</ErrorBoundary>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <LocationProvider>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={wrap(<Dashboard />)} />
                <Route path="/login" element={wrap(<Login />)} />
                <Route path="/signup" element={<Navigate to="/login" replace />} />
                <Route path="/reset-password" element={wrap(<ResetPassword />)} />
                <Route path="/accept-invite" element={wrap(<AcceptInvite />)} />
                <Route path="/no-access" element={wrap(<NoAccess />)} />
                <Route path="/oauth/consent" element={wrap(<OAuthConsent />)} />
                <Route path="/oauth/callback" element={wrap(<OAuthCallback />)} />
                <Route path="/embed" element={wrap(<Embed />)} />
                <Route path="/deal/:id" element={wrap(<PublicDeal />)} />
                <Route path="/buyers" element={wrap(<Buyers />)} />
                
                <Route path="/finder" element={wrap(<Finder />)} />
                <Route path="/pipeline" element={wrap(<Pipeline />)} />
                <Route path="/kpis" element={wrap(<KPIs />)} />
                <Route path="/tasks" element={wrap(<Tasks />)} />
                <Route path="/admin" element={wrap(<Admin />)} />
                <Route path="/profile" element={wrap(<Profile />)} />
                <Route path="/settings" element={wrap(<Settings />)} />
                <Route path="/settings/pipelines" element={wrap(<PipelineMapping />)} />
                <Route path="/title-companies" element={wrap(<TitleCompanies />)} />
                <Route path="/team" element={<Navigate to="/settings?tab=team" replace />} />
                <Route path="*" element={wrap(<NotFound />)} />
              </Routes>
            </ErrorBoundary>
          </LocationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
