from fastapi import APIRouter, Depends, HTTPException
from database import db
from dependencies import get_current_user, require_admin
from models import User, Printer, PrinterCreate, PrinterUpdate, PrinterSendData, ScanRequest
from typing import List, Optional
from datetime import datetime, timezone
from routers.receipts import generate_escpos_test_receipt
import socket
import base64
import asyncio
import concurrent.futures

router = APIRouter()


@router.get("/printers", response_model=List[Printer])
async def get_printers(current_user: User = Depends(require_admin)):
    query = {}
    if current_user.role != 'platform_owner' and current_user.restaurant_id:
        query["restaurant_id"] = current_user.restaurant_id
    printers = await db.printers.find(query, {"_id": 0}).to_list(100)
    return [Printer(**p) for p in printers]


@router.post("/printers", response_model=Printer)
async def create_printer(printer_data: PrinterCreate, current_user: User = Depends(require_admin)):
    if not current_user.restaurant_id and current_user.role != 'platform_owner':
        raise HTTPException(status_code=400, detail="No restaurant associated with user")

    restaurant_id = current_user.restaurant_id or "platform"
    printer_id = f"printer_{datetime.now(timezone.utc).timestamp()}"

    if printer_data.is_default:
        await db.printers.update_many({"restaurant_id": restaurant_id}, {"$set": {"is_default": False}})

    printer_dict = {
        "id": printer_id,
        "name": printer_data.name,
        "type": printer_data.type,
        "address": printer_data.address,
        "restaurant_id": restaurant_id,
        "is_default": printer_data.is_default,
        "paper_width": printer_data.paper_width,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.printers.insert_one(printer_dict)
    return Printer(**printer_dict)


@router.put("/printers/{printer_id}", response_model=Printer)
async def update_printer(printer_id: str, printer_data: PrinterUpdate, current_user: User = Depends(require_admin)):
    update_dict = {k: v for k, v in printer_data.model_dump().items() if v is not None}

    if printer_data.is_default:
        restaurant_id = current_user.restaurant_id or "platform"
        await db.printers.update_many({"restaurant_id": restaurant_id, "id": {"$ne": printer_id}}, {"$set": {"is_default": False}})

    if update_dict:
        await db.printers.update_one({"id": printer_id}, {"$set": update_dict})

    updated = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Printer not found")
    return Printer(**updated)


@router.delete("/printers/{printer_id}")
async def delete_printer(printer_id: str, current_user: User = Depends(require_admin)):
    result = await db.printers.delete_one({"id": printer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Printer not found")
    return {"message": "Printer deleted"}


@router.post("/printers/{printer_id}/test")
async def test_printer(printer_id: str, current_user: User = Depends(require_admin)):
    printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    test_commands = generate_escpos_test_receipt(printer)
    return {
        "message": "Test receipt generated",
        "printer": printer["name"],
        "type": printer["type"],
        "address": printer["address"],
        "commands": test_commands,
        "instructions": "Send these commands to the printer via Bluetooth or TCP socket"
    }


@router.post("/printer/send")
async def send_to_wifi_printer(data: PrinterSendData, current_user: User = Depends(get_current_user)):
    try:
        raw_data = base64.b64decode(data.data)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        try:
            sock.connect((data.ip, data.port))
            sock.sendall(raw_data)
            sock.close()
            return {"success": True, "message": f"Data sent to {data.ip}:{data.port}"}
        except socket.timeout:
            raise HTTPException(status_code=408, detail=f"Connection timeout to {data.ip}:{data.port}")
        except ConnectionRefusedError:
            raise HTTPException(status_code=503, detail=f"Connection refused by {data.ip}:{data.port}. Check if printer is on and IP is correct.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Socket error: {str(e)}")
        finally:
            sock.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to send to printer: {str(e)}")


def _tcp_check(ip: str, port: int, timeout: float) -> dict:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        result = s.connect_ex((ip, port))
        s.close()
        if result == 0:
            name = "Unknown Device"
            try:
                s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s2.settimeout(1)
                s2.connect((ip, port))
                s2.sendall(b'\x10\x04\x01')
                data = s2.recv(256)
                s2.close()
                if data:
                    name = "ESC/POS Printer"
            except:
                if port == 9100:
                    name = "ESC/POS Printer (port 9100)"
                elif port == 515:
                    name = "LPR Printer"
                elif port == 631:
                    name = "IPP Printer"
            return {"ip": ip, "port": port, "name": name, "reachable": True}
    except:
        pass
    return None


@router.get("/printers/detect-subnet")
async def detect_subnet(current_user: User = Depends(get_current_user)):
    """Auto-detect the server's local network subnet."""
    import subprocess
    subnets = set()
    try:
        # Try multiple methods to detect local IPs
        # Method 1: socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            parts = ip.rsplit(".", 1)
            if len(parts) == 2 and not ip.startswith("127."):
                subnets.add(parts[0])
        except Exception:
            pass
        finally:
            s.close()

        # Method 2: hostname
        import socket as sock_mod
        hostname = sock_mod.gethostname()
        for info in sock_mod.getaddrinfo(hostname, None, sock_mod.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                parts = ip.rsplit(".", 1)
                if len(parts) == 2:
                    subnets.add(parts[0])
    except Exception:
        pass

    subnet_list = list(subnets) if subnets else ["192.168.1"]
    return {"subnets": subnet_list, "primary": subnet_list[0]}


@router.post("/printers/discover")
async def discover_printers(scan: ScanRequest, current_user: User = Depends(get_current_user)):
    ports = list(scan.ports)
    if scan.custom_port and scan.custom_port not in ports:
        ports.append(scan.custom_port)

    timeout_s = scan.timeout_ms / 1000.0
    found = []

    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as pool:
        tasks = []
        for port in ports:
            for i in range(1, 255):
                ip = f"{scan.subnet}.{i}"
                tasks.append(loop.run_in_executor(pool, _tcp_check, ip, port, timeout_s))

        results = await asyncio.gather(*tasks)
        for r in results:
            if r and r.get("reachable"):
                dup = any(d["ip"] == r["ip"] and d["port"] == r["port"] for d in found)
                if not dup:
                    found.append(r)

    return {"devices": found, "scanned_subnet": scan.subnet, "scanned_ports": ports}
