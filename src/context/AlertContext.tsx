import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message: string;
  buttons?: AlertButton[];
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastConfig {
  id: number;
  message: string;
  type: ToastType;
}

interface AlertContextType {
  alertConfig: AlertConfig | null;
  showAlert: (title: string, message: string, buttons?: AlertButton[]) => void;
  hideAlert: () => void;
  toast: ToastConfig | null;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const showAlert = (title: string, message: string, buttons?: AlertButton[]) => {
    setAlertConfig({ title, message, buttons });
  };

  const hideAlert = () => {
    setAlertConfig(null);
  };

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <AlertContext.Provider value={{ alertConfig, showAlert, hideAlert, toast, showToast, hideToast }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
