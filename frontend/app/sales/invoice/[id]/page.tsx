"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { storeConfig, fetchStoreConfig, StoreInfo } from "@/lib/store-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Printer, ArrowLeft, Send } from "lucide-react";

interface Product {
  id: number;
  name: string;
  sku: string;
}

interface ProductVariation {
  id: number;
  attributes: Record<string, string>;
  sku: string | null;
}

interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  variation_id?: number;
  unit: string;
  item_discount?: number;
  product_name?: string;
  variation_attributes?: Record<string, string>;
  product?: Product;
  variation?: ProductVariation;
}

interface ReturnItem {
  id: number;
  sale_item_id?: number | null;
  product_id: number;
  quantity: number;
  unit: string;
  total_refund?: number | null;
}

interface ReturnRecord {
  id: number;
  sale_id?: number | null;
  refund_amount: number;
  created_at: string;
  items: ReturnItem[];
}

interface User {
  id: number;
  username: string;
  full_name?: string;
}

interface Customer {
  id: number;
  name: string;
  phone?: string;
  current_mileage?: number;
  oil_change_interval?: number;
  next_oil_change_mileage?: number;
}

interface Sale {
  id: number;
  user_id: number;
  customer_id?: number;
  customer_name?: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_charges: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  change_amount: number;
  created_at: string;
  items: SaleItem[];
  user?: User;
  customer?: Customer;
}

export default function InvoicePage() {
  const params = useParams();
  const router = useRouter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sending, setSending] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [returnedBySaleItem, setReturnedBySaleItem] = useState<{ [key: number]: number }>({});
  const [returnRefundTotal, setReturnRefundTotal] = useState(0);
  const [storeInfo, setStoreInfo] = useState<StoreInfo>(storeConfig);

  useEffect(() => {
    fetchSaleDetails();
    fetchStoreConfig().then(setStoreInfo);
  }, [params.id]);

  const fetchSaleDetails = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch sale details
      const saleResponse = await api.get(`/sales/${params.id}`);
      const saleData = saleResponse.data;

      // Fetch returns for this sale
      let returnsData: ReturnRecord[] = [];
      try {
        const returnsRes = await api.get("/returns/", {
          params: { sale_id: saleData.id },
        });
        returnsData = returnsRes.data || [];
      } catch (err) {
        console.error("Failed to fetch returns:", err);
      }

      const returnedMap: { [key: number]: number } = {};
      let refundTotal = 0;
      returnsData.forEach((ret) => {
        refundTotal += ret.refund_amount || 0;
        ret.items.forEach((item) => {
          if (item.sale_item_id) {
            returnedMap[item.sale_item_id] =
              (returnedMap[item.sale_item_id] || 0) + (item.quantity || 0);
          }
        });
      });

      setReturnedBySaleItem(returnedMap);
      setReturnRefundTotal(refundTotal);

      // Fetch all users to get cashier info
      let userData = null;
      try {
        const usersResponse = await api.get("/users/");
        const users = usersResponse.data;
        userData = users.find((u: User) => u.id === saleData.user_id);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }

      // Fetch customer data if customer_ref_id is present
      let customerData = null;
      if (saleData.customer_ref_id) {
        try {
          const customerResponse = await api.get(`/customers/${saleData.customer_ref_id}`);
          customerData = customerResponse.data;
        } catch (err) {
          console.error("Failed to fetch customer:", err);
        }
      }

      setSale({
        ...saleData,
        user: userData,
        customer: customerData,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  const formatInvoiceNumber = (saleId: number): string => {
    return `INV-${String(saleId).padStart(6, "0")}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSendInvoice = async () => {
    if (!phoneNumber) {
      alert("Please enter a phone number");
      return;
    }

    setSending(true);
    try {
      console.log('Sending invoice via backend...');

      // Call backend endpoint to generate and send invoice
      const response = await api.post(`/sales/${params.id}/send-invoice?phone_number=${phoneNumber}`);

      console.log('Backend response:', response.data);

      alert('Invoice sent successfully!');
      setSendDialogOpen(false);
      setPhoneNumber('');
    } catch (err: any) {
      console.error('Failed to send invoice:', err);
      alert(err.response?.data?.detail || err.message || 'Failed to send invoice. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="container mx-auto p-8">
        <Card className="p-6 text-center">
          <p className="text-red-600 mb-4">{error || "Invoice not found"}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  const grossSubtotal = sale.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const itemDiscountTotal = sale.items.reduce((sum, item) => sum + (item.item_discount || 0), 0);
  const totalDiscount = sale.discount + itemDiscountTotal;
  const hasDiscount = sale.items.some((i) => (i.item_discount ?? 0) > 0);
  const totalQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const saleDate = new Date(sale.created_at);
  const dateOnly = saleDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeOnly = saleDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const paymentStatus = sale.amount_due > 0 ? "Cash Unpaid" : "Cash Paid";
  const customerDisplayName = sale.customer_name || sale.customer?.name || "Walk-in";
  const customerDisplayPhone = sale.customer?.phone || sale.customer?.id || "";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Action Buttons - Hidden when printing */}
      <div className="no-print bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSendDialogOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              Send Invoice
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Receipt
            </Button>
          </div>
        </div>
      </div>

      {/* Thermal Receipt Content */}
      <div className="invoice-container container mx-auto p-4 flex justify-center">
        <Card
          ref={invoiceRef}
          className="thermal-receipt bg-white shadow-lg w-full max-w-[80mm] mx-auto"
        >
          <div className="p-2 text-[11px] leading-tight">
            <div className="text-center pb-1">
              <div className="inline-block bg-black text-white px-5 py-1 text-lg font-bold tracking-wide">
                INVOICE
              </div>
              <h1 className="mt-1 text-xl font-black uppercase tracking-tight">{storeInfo.name}</h1>
              {(storeInfo.address || storeInfo.city) && (
                <p className="text-[12px] mt-0.5">{[storeInfo.address, storeInfo.city].filter(Boolean).join(" ")}</p>
              )}
              <p className="text-[12px] mt-0.5">
                {storeInfo.phone ? `Cell:${storeInfo.phone}` : "Cell: —"}
                {storeInfo.phone ? ` / Wapp:${storeInfo.phone.replace(/^0/, "")}` : ""}
              </p>
              {storeInfo.email && <p className="text-[12px]">{storeInfo.email}</p>}
            </div>

            <div className="border-y-2 border-black py-1 mt-1">
              <div className="flex justify-between">
                <span className="font-semibold">BillNo.</span>
                <span className="font-bold">{sale.id}</span>
                <span className="font-semibold">Order #</span>
                <span className="font-bold">{formatInvoiceNumber(sale.id)}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="font-semibold">Contact#</span>
                <span className="truncate max-w-[42%]">{customerDisplayPhone || "Walk-in"}</span>
                <span>{timeOnly}</span>
                <span>{dateOnly}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="font-semibold">Name :</span>
                <span className="font-semibold text-right max-w-[70%] truncate">{customerDisplayName}</span>
              </div>
            </div>

            <div className="flex justify-between py-1 border-b border-black">
              <div>
                <span className="font-semibold">Items:</span> {sale.items.length.toFixed(2)}
              </div>
              <div>
                <span className="font-semibold">Qty :</span> {totalQty}
              </div>
            </div>

            <table className="w-full mt-1" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-gray-200 border-y border-gray-400">
                  <th className="text-left px-0.5 py-0.5 w-4">#</th>
                  <th className="text-left px-0.5 py-0.5">Description</th>
                  <th className="text-center px-0.5 py-0.5 w-10">Qty</th>
                  {hasDiscount && <th className="text-right px-0.5 py-0.5 w-10">Disc</th>}
                  <th className="text-right px-0.5 py-0.5 w-10">Rate</th>
                  <th className="text-right px-0.5 py-0.5 w-12">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, index) => {
                  const varAttrs = item.variation_attributes || item.variation?.attributes;
                  const varLabel = varAttrs
                    ? Object.entries(varAttrs).map(([, v]) => `${v}`).join("/")
                    : "";
                  const returned = returnedBySaleItem[item.id] || 0;
                  const disc = item.item_discount ?? 0;
                  return (
                    <>
                      <tr key={item.id} className="border-b border-gray-300 align-top">
                        <td className="px-0.5 py-0.5">{index + 1}</td>
                        <td className="px-0.5 py-0.5 font-semibold">
                          {item.product_name || item.product?.name || `#${item.product_id}`}
                          {varLabel && <span className="block font-normal text-[10px]">{varLabel}</span>}
                          <span className="block font-normal text-[10px] uppercase">{item.unit}</span>
                        </td>
                        <td className="px-0.5 py-0.5 text-center">{item.quantity}</td>
                        {hasDiscount && (
                          <td className="px-0.5 py-0.5 text-right">{disc > 0 ? `-${disc.toFixed(0)}` : "0"}</td>
                        )}
                        <td className="px-0.5 py-0.5 text-right">{item.unit_price.toFixed(0)}</td>
                        <td className="px-0.5 py-0.5 text-right font-bold">{item.total_price.toFixed(0)}</td>
                      </tr>
                      {returned > 0 && (
                        <tr key={`ret-${item.id}`} className="text-orange-700 border-b border-gray-200">
                          <td></td>
                          <td className="px-0.5 pb-0.5" colSpan={hasDiscount ? 5 : 4}>
                            Returned: {returned} {item.unit}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-1 border-y border-black py-1">
              <div className="flex justify-between font-semibold">
                <span>Total Amount</span>
                <span>{grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="py-1 space-y-0.5">
              <div className="flex justify-between">
                <span>Other Charges</span>
                <span>{sale.tax > 0 ? sale.tax.toFixed(0) : 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>{totalDiscount > 0 ? `- ${totalDiscount.toFixed(0)}` : 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>{sale.delivery_charges > 0 ? sale.delivery_charges.toFixed(0) : 0}</span>
              </div>
              <div className="flex justify-between font-bold text-[15px] border-t border-black pt-0.5 mt-0.5">
                <span>Payable</span>
                <span>{sale.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span>Received</span>
                <span>{sale.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Due Cash</span>
                <span>{sale.amount_due.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {returnRefundTotal > 0 && (
                <div className="flex justify-between text-red-700 font-semibold">
                  <span>Refunded</span>
                  <span>-{returnRefundTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <div className="border-y-2 border-black py-1 text-right font-bold text-[20px]">
              {paymentStatus}
            </div>

            <div className="pt-2 text-[10px] leading-snug">
              <p>1. Return and Exchange acceptable with invoice.</p>
              <p>2. Frozen and cosmetic items cannot be returned.</p>
              <p>3. Home delivery available.</p>
              <p>4. For complaint and suggestion call: {storeInfo.phone || "—"}</p>
              <p className="text-center mt-1">VibePOS (by vibeexe.com)</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Send Invoice Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Invoice via WhatsApp</DialogTitle>
            <DialogDescription>
              Enter customer's phone number to send the invoice
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="03171585452 or +923171585452"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Format: 03XX, +92XXX, or 92XXX
              </p>
            </div>
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm text-gray-700">
                <strong>Invoice:</strong> {formatInvoiceNumber(sale!.id)}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Total:</strong> rs {sale!.total.toFixed(2)}
              </p>
              {sale!.customer_name && (
                <p className="text-sm text-gray-700">
                  <strong>Customer:</strong> {sale!.customer_name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSendDialogOpen(false);
                setPhoneNumber('');
              }}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button onClick={handleSendInvoice} disabled={sending}>
              {sending ? 'Sending...' : 'Send Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
