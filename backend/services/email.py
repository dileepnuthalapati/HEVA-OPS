import os
import asyncio
import logging
import resend
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("email")

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


async def send_email(to: str, subject: str, html: str) -> dict:
    """Send an email via Resend. Non-blocking."""
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not set — email skipped")
        return {"status": "skipped", "reason": "No API key"}

    params = {
        "from": SENDER_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to}: {subject}")
        return {"status": "sent", "email_id": result.get("id") if isinstance(result, dict) else str(result)}
    except Exception as e:
        logger.error(f"Email failed to {to}: {e}")
        return {"status": "failed", "error": str(e)}


def daily_summary_html(business_name: str, date_str: str, data: dict, currency_sym: str = "£") -> str:
    """Generate HTML for the daily summary email."""
    total_revenue = data.get("total_revenue", 0)
    total_orders = data.get("total_orders", 0)
    cash_amount = data.get("cash_amount", 0)
    card_amount = data.get("card_amount", 0)
    avg_order = total_revenue / total_orders if total_orders > 0 else 0
    top_products = data.get("top_products", [])
    staff_stats = data.get("staff_stats", [])

    top_items_rows = ""
    for i, p in enumerate(top_products[:5]):
        top_items_rows += f"""
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;">#{i+1} {p.get('name','')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;text-align:right;">{p.get('quantity',0)} sold</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#059669;text-align:right;font-weight:600;">{currency_sym}{p.get('revenue',0):.2f}</td>
        </tr>"""

    staff_rows = ""
    for s in staff_stats[:5]:
        staff_rows += f"""
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;">{s.get('name','')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;text-align:right;">{s.get('orders',0)} orders</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#059669;text-align:right;font-weight:600;">{currency_sym}{s.get('revenue',0):.2f}</td>
        </tr>"""

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px 24px;text-align:center;">
        <h1 style="color:#fff;font-size:24px;margin:0 0 4px;">Heva<span style="color:#818cf8;">One</span></h1>
        <p style="color:#94a3b8;font-size:13px;margin:0;">Daily Summary for {business_name}</p>
      </div>
      <div style="padding:24px;">
        <p style="color:#64748b;font-size:13px;margin:0 0 16px;">Here's how <strong>{date_str}</strong> went:</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="padding:16px;background:#f0fdf4;border-radius:12px;text-align:center;width:50%;">
              <div style="font-size:28px;font-weight:700;color:#059669;">{currency_sym}{total_revenue:.2f}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Total Revenue</div>
            </td>
            <td style="width:12px;"></td>
            <td style="padding:16px;background:#f8fafc;border-radius:12px;text-align:center;width:50%;">
              <div style="font-size:28px;font-weight:700;color:#334155;">{total_orders}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Orders</div>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center;width:33%;">
              <div style="font-size:18px;font-weight:600;color:#334155;">{currency_sym}{cash_amount:.2f}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">Cash</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center;width:33%;">
              <div style="font-size:18px;font-weight:600;color:#334155;">{currency_sym}{card_amount:.2f}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">Card</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center;width:33%;">
              <div style="font-size:18px;font-weight:600;color:#334155;">{currency_sym}{avg_order:.2f}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">Avg Order</div>
            </td>
          </tr>
        </table>"""

    # Append optional sections outside f-string
    if top_items_rows:
        html += '<h3 style="font-size:15px;color:#1e293b;margin:0 0 8px;">Top Sellers</h3>'
        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">' + top_items_rows + '</table>'
    if staff_rows:
        html += '<h3 style="font-size:15px;color:#1e293b;margin:0 0 8px;">Staff Performance</h3>'
        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">' + staff_rows + '</table>'

    html += """
      </div>
      <div style="padding:16px 24px;background:#f8fafc;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Sent by Heva One — Your business management platform</p>
      </div>
    </div>"""
    return html


def trial_reminder_html(business_name: str, days_left: int) -> str:
    """Generate HTML for trial expiry reminder."""
    urgency_color = "#dc2626" if days_left <= 1 else "#f59e0b" if days_left <= 3 else "#3b82f6"
    plural = "s" if days_left > 1 else ""
    urgency_text = "expires today!" if days_left <= 0 else f"expires in {days_left} day{plural}"

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px 24px;text-align:center;">
        <h1 style="color:#fff;font-size:24px;margin:0 0 4px;">Heva<span style="color:#818cf8;">One</span></h1>
        <p style="color:#94a3b8;font-size:13px;margin:0;">Trial Reminder</p>
      </div>
      <div style="padding:32px 24px;text-align:center;">
        <div style="display:inline-block;padding:12px 24px;background:{urgency_color}15;border:2px solid {urgency_color};border-radius:12px;margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:{urgency_color};">Your trial {urgency_text}</span>
        </div>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
          Hi there! Your free trial for <strong>{business_name}</strong> on Heva One is coming to an end.
          To keep using all your features without interruption, upgrade your plan today.
        </p>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 16px;">
          After the trial ends, your data will be safely preserved, but access to premium modules will be paused until you subscribe.
        </p>
      </div>
      <div style="padding:16px 24px;background:#f8fafc;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Sent by Heva One — Your business management platform</p>
      </div>
    </div>"""
