import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import Optional

# SMTP configuration from environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "MyPeribadi <noreply@myperibadi.com>")
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "https://app.myperibadi.com").rstrip("/")

LOGO_CID = "myperibadi_logo"
LOGO_PATH = os.getenv("MYPE_LOGO_PATH", "../web/public/logoweb.png")
LOGO_PATH = os.path.join(os.path.dirname(__file__), LOGO_PATH)

LOGO_HTML = (
    f'<img src="cid:{LOGO_CID}" alt="MyPeribadi" '
    'style="height:44px;max-width:220px;display:inline-block;"/>'
)

def _attach_logo(msg: MIMEMultipart):
    """Attach the MyPeribadi logo as an inline CID image (works without remote image loading)."""
    try:
        with open(LOGO_PATH, "rb") as f:
            img = MIMEImage(f.read(), _subtype="png")
        img.add_header("Content-ID", f"<{LOGO_CID}>")
        img.add_header("Content-Disposition", "inline", filename="logoweb.png")
        msg.attach(img)
    except Exception as e:
        print(f"⚠️ Could not attach logo: {e}")

async def send_account_verification_email(email: str, user_name: str):
    """Requests that a suspended account confirm ownership before access is restored.
    Response is reviewed manually by an admin before reactivation."""
    subject = "Action Required: Verify Your MyPeribadi Account"
    greeting = f"Hi {user_name},"
    message = ("Your MyPeribadi account has been suspended pending verification. "
               "To restore access, please confirm that this email address belongs to you "
               "by replying directly to this email.")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {{ font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; }}
            .header {{ text-align: center; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 800; color: #d97706; letter-spacing: -1px; }}
            .content {{ line-height: 1.6; color: #333; }}
            .button-container {{ text-align: center; padding: 30px 0; }}
            .button {{ background: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; }}
            .footer {{ font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {LOGO_HTML}
                <div style="color: #666; font-size: 14px; margin-top: 5px;">Account Verification Required</div>
            </div>
            <div class="content">
                <h3>Verify Your Account</h3>
                <p>{greeting}</p>
                <p>{message}</p>
                <p style="font-size: 13px; color: #666;">
                    If you did not create this account or do not recognise this request, you can ignore this email.
                </p>
            </div>
            <div class="footer">
                <p>This is an automated notification from MyPeribadi.</p>
                <p>&copy; 2026 MyPeribadi. MyPeribadi.</p>
            </div>
        </div>
    </body>
    </html>
    """

    if not SMTP_USER or not SMTP_PASS:
        print(f"⚠️ SMTP credentials not set. Account verification email skipped for {email}.")
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_content, "html"))
        _attach_logo(msg)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"❌ Failed to send account verification email: {e}")
        return False

async def send_reset_password_email(email: str, token: str, user_name: str, language: str = "BM"):
    """
    Sends a password reset email to the user.
    """
    # Create the reset link
    reset_link = f"{APP_PUBLIC_URL}/reset-password?token={token}"
    
    if language == "BM":
        subject = "Tetapan Semula Kata Laluan MyPeribadi"
        title = "Tetapan Semula Kata Laluan"
        greeting = f"Hai {user_name},"
        message = "Anda telah meminta untuk menetapkan semula kata laluan anda. Klik butang di bawah untuk meneruskan:"
        button_text = "Tetapkan Kata Laluan Baru"
        footer = "Jika anda tidak meminta perubahan ini, sila abaikan e-mel ini."
    else:
        subject = "MyPeribadi Password Reset"
        title = "Reset Your Password"
        greeting = f"Hi {user_name},"
        message = "You have requested to reset your password. Click the button below to proceed:"
        button_text = "Reset Password"
        footer = "If you did not request this change, please ignore this email."

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {{ font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; }}
            .header {{ text-align: center; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 800; color: #6366f1; letter-spacing: -1px; }}
            .content {{ line-height: 1.6; color: #333; }}
            .button-container {{ text-align: center; padding: 30px 0; }}
            .button {{ background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; }}
            .footer {{ font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {LOGO_HTML}
                <div style="color: #666; font-size: 14px; margin-top: 5px;">Modern Expense Management</div>
            </div>
            <div class="content">
                <h3>{title}</h3>
                <p>{greeting}</p>
                <p>{message}</p>
                <div class="button-container">
                    <a href="{reset_link}" class="button">{button_text}</a>
                </div>
                <p style="font-size: 13px; color: #666;">
                    Or copy and paste this link in your browser:<br>
                    <a href="{reset_link}" style="color: #6366f1;">{reset_link}</a>
                </p>
            </div>
            <div class="footer">
                <p>{footer}</p>
                <p>&copy; 2026 MyPeribadi. MyPeribadi.</p>
            </div>
        </div>
    </body>
    </html>
    """

    # Check if SMTP credentials are provided
    if not SMTP_USER or not SMTP_PASS:
        print(f"⚠️ SMTP credentials not set. Reset email skipped for {email}.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_FROM
        msg['To'] = email
        msg['Subject'] = subject

        msg.attach(MIMEText(html_content, 'html'))
        _attach_logo(msg)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        
        return True
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        return False


async def send_email_change_verification_email(email: str, code: str, user_name: str, language: str = "BM"):
    """
    Sends email verification code for changing account email.
    """
    if language == "BM":
        subject = "Kod Pengesahan Tukar E-mel MyPeribadi"
        title = "Sahkan E-mel Baru Anda"
        greeting = f"Hai {user_name},"
        message = "Gunakan kod di bawah untuk sahkan pertukaran e-mel akaun anda:"
        footer = "Jika anda tidak meminta pertukaran e-mel, sila abaikan e-mel ini."
    else:
        subject = "MyPeribadi Email Change Verification Code"
        title = "Verify Your New Email"
        greeting = f"Hi {user_name},"
        message = "Use the code below to verify your account email change:"
        footer = "If you did not request this email change, please ignore this message."

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {{ font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; }}
            .header {{ text-align: center; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 800; color: #6366f1; letter-spacing: -1px; }}
            .content {{ line-height: 1.6; color: #333; }}
            .code-box {{ margin: 24px auto; width: fit-content; border-radius: 10px; border: 1px solid #d1d5db; background: #f9fafb; padding: 12px 20px; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #111827; }}
            .footer {{ font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {LOGO_HTML}
                <div style="color: #666; font-size: 14px; margin-top: 5px;">Modern Expense Management</div>
            </div>
            <div class="content">
                <h3>{title}</h3>
                <p>{greeting}</p>
                <p>{message}</p>
                <div class="code-box">{code}</div>
                <p style="font-size: 13px; color: #666;">This code expires in 15 minutes.</p>
            </div>
            <div class="footer">
                <p>{footer}</p>
                <p>&copy; 2026 MyPeribadi. MyPeribadi.</p>
            </div>
        </div>
    </body>
    </html>
    """

    if not SMTP_USER or not SMTP_PASS:
        print(f"⚠️ SMTP credentials not set. Email change code skipped for {email}.")
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_content, "html"))
        _attach_logo(msg)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"❌ Failed to send email-change verification email: {e}")
        return False


async def send_removed_business_activation_email(email: str, user_name: str):
    subject = "Your MyPeribadi Business Account Has Been Activated"
    greeting = f"Hi {user_name},"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .container {{ font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; }}
            .header {{ text-align: center; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 800; color: #16a34a; letter-spacing: -1px; }}
            .content {{ line-height: 1.6; color: #333; }}
            .button-container {{ text-align: center; padding: 30px 0; }}
            .button {{ background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; }}
            .footer {{ font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                {LOGO_HTML}
                <div style="color: #666; font-size: 14px; margin-top: 5px;">Business Tools Activated</div>
            </div>
            <div class="content">
                <h3>Your Business Account Is Now Active</h3>
                <p>{greeting}</p>
                <p>Your MyPeribadi Business account has been activated. You can now access Business Mode and start using tools for orders, products, stock, reports, customers, riders, and WhatsApp business features.</p>
                <div class="button-container">
                    <a href="{APP_PUBLIC_URL}" class="button">Open MyPeribadi</a>
                </div>
                <p style="font-size: 13px; color: #666;">If you did not request Business access, please contact support.</p>
            </div>
            <div class="footer">
                <p>This is an automated notification from MyPeribadi.</p>
                <p>&copy; 2026 MyPeribadi. MyPeribadi.</p>
            </div>
        </div>
    </body>
    </html>
    """

    if not SMTP_USER or not SMTP_PASS:
        print(f"⚠️ SMTP credentials not set. RemovedBusiness activation email skipped for {email}.")
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_content, "html"))
        _attach_logo(msg)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"❌ Failed to send removed_business activation email: {e}")
        return False
