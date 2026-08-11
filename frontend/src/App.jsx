import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import ReviewDetailPage from './pages/ReviewDetailPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppHeader from './components/AppHeader.jsx';

export default function App() {
  return (
    <>
      <AppHeader />
      <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <ProjectDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reviews/:reviewId"
        element={
          <ProtectedRoute>
            <ReviewDetailPage />
          </ProtectedRoute>
        }
      />
      </Routes>
    </>
  );
}
