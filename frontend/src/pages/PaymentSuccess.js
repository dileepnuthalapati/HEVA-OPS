import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const orderId = searchParams.get('order_id');
  const [status, setStatus] = useState('checking'); // checking, paid, failed
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus('failed');
      return;
    }
    pollStatus();
  }, [sessionId]);

  const pollStatus = async () => {
    const maxAttempts = 8;
    const interval = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await axios.get(`${API_URL}/api/payments/checkout-status/${sessionId}`);
        setAttempts(i + 1);
        if (res.data.payment_status === 'paid') {
          setStatus('paid');
          return;
        }
        if (res.data.status === 'expired') {
          setStatus('failed');
          return;
        }
      } catch {
        // continue polling
      }
      await new Promise(r => setTimeout(r, interval));
    }
    setStatus('failed');
  };

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6" data-testid="payment-success-page">
      <div className="text-center text-white max-w-sm">
        {status === 'checking' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-6 text-amber-400 animate-spin" />
            <h1 className="text-2xl font-bold mb-2">Verifying Payment...</h1>
            <p className="text-stone-400">Please wait while we confirm your payment.</p>
            <p className="text-stone-500 text-xs mt-4">Attempt {attempts}/8</p>
          </>
        )}
        {status === 'paid' && (
          <>
            <CheckCircle className="w-20 h-20 mx-auto mb-6 text-emerald-400" />
            <h1 className="text-3xl font-black mb-2">Payment Complete</h1>
            <p className="text-stone-400 text-lg mb-1">Thank you for dining with us!</p>
            <p className="text-stone-500 text-sm">Your bill has been settled. You're free to leave.</p>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-6 text-red-400" />
            <h1 className="text-2xl font-bold mb-2">Payment Issue</h1>
            <p className="text-stone-400 mb-4">We couldn't verify your payment. Please check with your server.</p>
            {orderId && (
              <p className="text-stone-500 text-xs font-mono">Order: {orderId}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
