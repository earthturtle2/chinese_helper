import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.me()
        .then(data => setUser(data))
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    localStorage.setItem('token', data.token);
    const me = await api.me();
    setUser(me);
    return me;
  };

  const loginAdmin = async (username, password) => {
    const data = await api.adminLogin(username, password);
    localStorage.setItem('token', data.token);
    const me = await api.me();
    setUser(me);
    return me;
  };

  const register = async (payload) => {
    const data = await api.register(payload);
    localStorage.setItem('token', data.token);
    const me = await api.me();
    setUser(me);
    return me;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAdmin, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
