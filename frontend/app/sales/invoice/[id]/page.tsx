"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import api from "@/lib/api";
import type { InvoiceDesign, InvoiceFormat, SaleOilChangeDetails } from "@/lib/api";
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
import { Printer, ArrowLeft, Send, FileText } from "lucide-react";

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
  customer_phone?: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_charges: number;
  total: number;
  previous_balance: number;
  amount_paid: number;
  amount_due: number;
  change_amount: number;
  created_at: string;
  items: SaleItem[];
  oil_change?: SaleOilChangeDetails | null;
  user?: User;
  customer?: Customer;
}

const getWhatsAppNumber = (phone: string): string => {
  const mobileMatch = phone.match(/(?:\+?92|0)?3\d{2}[\s-]?\d{7}/);
  if (mobileMatch) return mobileMatch[0].trim();

  return phone.split(/[\/,|]/)[0]?.trim() || "—";
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") return fallback;

  const requestError = error as {
    message?: string;
    response?: { data?: { detail?: string } };
  };
  return requestError.response?.data?.detail || requestError.message || fallback;
};

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
  const [printFormat, setPrintFormat] = useState<InvoiceFormat>("compact");
  const [whatsAppFormat, setWhatsAppFormat] = useState<InvoiceFormat>("mobile");
  const [printDesign, setPrintDesign] = useState<InvoiceDesign>("classic");
  const [whatsAppDesign, setWhatsAppDesign] = useState<InvoiceDesign>("modern");

  const fetchSaleDetails = useCallback(async () => {
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load invoice"));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void fetchSaleDetails();
    void fetchStoreConfig().then(config => {
      setStoreInfo(config);
      setPrintFormat(config.defaultPrintFormat);
      setWhatsAppFormat(config.defaultWhatsAppFormat);
      setPrintDesign(config.defaultPrintDesign);
      setWhatsAppDesign(config.defaultWhatsAppDesign);
    });
  }, [fetchSaleDetails]);

  const formatInvoiceNumber = (saleId: number): string => {
    return `INV-${String(saleId).padStart(6, "0")}`;
  };

  const handlePrint = () => {
    document.body.dataset.invoiceFormat = printFormat;
    window.addEventListener("afterprint", () => {
      delete document.body.dataset.invoiceFormat;
    }, { once: true });
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
      const response = await api.post(`/sales/${params.id}/send-invoice`, null, {
        params: { phone_number: phoneNumber, invoice_format: whatsAppFormat, invoice_design: whatsAppDesign },
      });

      console.log('Backend response:', response.data);

      alert('Invoice sent successfully!');
      setSendDialogOpen(false);
      setPhoneNumber('');
    } catch (err: unknown) {
      console.error('Failed to send invoice:', err);
      alert(getErrorMessage(err, 'Failed to send invoice. Please try again.'));
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
  const accountBalance = sale.previous_balance + sale.amount_due;
  const paymentStatus = accountBalance > 0 ? "BALANCE DUE" : "PAID";
  const customerDisplayName = sale.customer_name || sale.customer?.name || "Walk-in";
  const customerDisplayPhone = sale.customer?.phone || sale.customer?.id || "";
  const whatsappNumber = getWhatsAppNumber(storeInfo.phone);

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
            <select
              aria-label="Print invoice format"
              value={printFormat}
              onChange={event => setPrintFormat(event.target.value as InvoiceFormat)}
              className="rounded-md border bg-white px-3 text-sm"
            >
              <option value="compact">Compact Receipt</option>
              <option value="professional">Professional A4</option>
              <option value="mobile">Mobile Invoice</option>
            </select>
            <select
              aria-label="Print invoice design"
              value={printDesign}
              onChange={event => setPrintDesign(event.target.value as InvoiceDesign)}
              className="rounded-md border bg-white px-3 text-sm"
            >
              <option value="classic">Ledger Design</option>
              <option value="modern">Commerce Design</option>
              <option value="minimal">Essential Design</option>
            </select>
            <Button variant="outline" onClick={() => {
              setPhoneNumber(sale.customer?.phone || sale.customer_phone || "");
              setSendDialogOpen(true);
            }}>
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
          className={`invoice-document invoice-format-${printFormat} invoice-design-${printDesign} bg-white shadow-lg w-full mx-auto ${printFormat === "compact" ? "max-w-[80mm]" : printFormat === "mobile" ? "max-w-[108mm]" : "max-w-[210mm]"}`}
        >
          <div className="invoice-document-inner p-2 text-[11px] leading-tight">
            <div className="invoice-header pb-1">
              <div className="invoice-brand text-center">
                {storeInfo.logoUrl && (
                  <Image
                    src={storeInfo.logoUrl}
                    alt={`${storeInfo.name} logo`}
                    width={180}
                    height={90}
                    unoptimized
                    className="invoice-logo mx-auto mb-2 h-auto max-h-16 w-auto max-w-[55%] object-contain"
                  />
                )}
                <h1 className="mt-1 text-xl font-black uppercase tracking-tight">{storeInfo.name}</h1>
                {(storeInfo.address || storeInfo.city) && (
                  <p className="text-[12px] mt-0.5">{[storeInfo.address, storeInfo.city].filter(Boolean).join(" ")}</p>
                )}
                <p className="text-[12px] mt-0.5">
                  {storeInfo.phone ? storeInfo.phone : ""}
                  {storeInfo.email && storeInfo.phone ? " · " : ""}
                  {storeInfo.email}
                </p>
                {storeInfo.showTaxId && storeInfo.taxId && <p className="text-[12px]">Tax ID / NTN: {storeInfo.taxId}</p>}
              </div>
              <div className="invoice-heading text-center">
                <p className="invoice-eyebrow">Sales document</p>
                <div className="invoice-title inline-block bg-black text-white px-5 py-1 text-lg font-bold tracking-wide">
                  INVOICE
                </div>
                <p className="invoice-number mt-1 font-semibold">{formatInvoiceNumber(sale.id)}</p>
              </div>
            </div>

            <div className="invoice-meta border-y-2 border-black py-1 mt-1">
              <div className="flex justify-between">
                <span className="invoice-meta-label font-semibold">Bill No.</span>
                <span className="font-bold">{sale.id}</span>
                <span className="invoice-meta-label font-semibold">Issued</span>
                <span className="font-bold">{dateOnly}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="invoice-meta-label font-semibold">Contact</span>
                <span className="truncate max-w-[42%]">{customerDisplayPhone || "Walk-in"}</span>
                <span>{timeOnly}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="invoice-meta-label font-semibold">Customer</span>
                <span className="font-semibold text-right max-w-[70%] truncate">{customerDisplayName}</span>
              </div>
              {storeInfo.showCashier && (
                <div className="flex justify-between mt-0.5">
                  <span className="font-semibold">Cashier:</span>
                  <span>{sale.user?.full_name || sale.user?.username || `#${sale.user_id}`}</span>
                </div>
              )}
            </div>

            <div className="invoice-counts flex justify-between py-1 border-b border-black">
              <div>
                <span className="font-semibold">Items:</span> {sale.items.length.toFixed(2)}
              </div>
              <div>
                <span className="font-semibold">Qty :</span> {totalQty}
              </div>
            </div>

            {sale.oil_change && (
              <div className="border-b border-black py-1.5">
                <p className="font-bold uppercase">Vehicle / Oil Change</p>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span>Vehicle</span><span className="text-right font-semibold">{sale.oil_change.vehicle_identifier}</span>
                  <span>Previous meter</span><span className="text-right">{sale.oil_change.previous_mileage == null ? "Not recorded" : `${sale.oil_change.previous_mileage.toLocaleString()} KM`}</span>
                  <span>Current meter</span><span className="text-right">{sale.oil_change.current_mileage.toLocaleString()} KM</span>
                  <span>Change after</span><span className="text-right">{sale.oil_change.oil_change_interval.toLocaleString()} KM</span>
                  <span>Next oil change</span><span className="text-right font-bold">{sale.oil_change.next_oil_change_mileage.toLocaleString()} KM</span>
                </div>
              </div>
            )}

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
                          {storeInfo.showSku && (item.product?.sku || item.variation?.sku) && (
                            <span className="block font-normal text-[9px]">SKU: {item.variation?.sku || item.product?.sku}</span>
                          )}
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

            <div className="invoice-subtotal mt-1 border-y border-black py-1">
              <div className="flex justify-between font-semibold">
                <span>Total Amount</span>
                <span>{grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="invoice-totals py-1 space-y-0.5">
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
              <div className="invoice-current-total flex justify-between font-bold text-[15px] border-t border-black pt-0.5 mt-0.5">
                <span>Current Bill</span>
                <span>{sale.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {Math.abs(sale.previous_balance) > 0.005 && (
                <>
                  <div className="flex justify-between font-semibold text-orange-800">
                    <span>Previous Balance</span>
                    <span>{sale.previous_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="invoice-grand-total flex justify-between font-black text-[16px] border-t border-black pt-0.5">
                    <span>Grand Total</span>
                    <span>{(sale.total + sale.previous_balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span>Cash Received</span>
                <span>{sale.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {sale.payment_method === "cash" && (
                <div className="flex justify-between font-semibold">
                  <span>Return Cash</span>
                  <span>{sale.change_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {storeInfo.showCustomerBalance && (
                <div className="flex justify-between font-semibold">
                  <span>Total Balance</span>
                  <span>{(sale.previous_balance + sale.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {returnRefundTotal > 0 && (
                <div className="flex justify-between text-red-700 font-semibold">
                  <span>Refunded</span>
                  <span>-{returnRefundTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <div className={`invoice-status border-y-2 border-black py-1 text-right font-bold text-[20px] ${accountBalance > 0 ? "invoice-status-due" : "invoice-status-paid"}`}>
              {paymentStatus}
            </div>

            <div className="invoice-footer pt-2 text-[10px] leading-snug">
              {storeInfo.footerMessage && <p className="text-center font-semibold mb-1">{storeInfo.footerMessage}</p>}
              {storeInfo.terms.split("\n").filter(Boolean).map((term, index) => <p key={`${index}-${term}`}>{index + 1}. {term}</p>)}
              <p>Complaint &amp; suggestion WhatsApp: {whatsappNumber}</p>
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
              Enter customer&apos;s phone number to send the invoice
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
            <div className="space-y-2">
              <Label htmlFor="whatsapp-format">Invoice Format</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["mobile", "Mobile image"],
                  ["compact", "Compact image"],
                  ["professional", "A4 PDF"],
                ] as Array<[InvoiceFormat, string]>).map(([format, label]) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setWhatsAppFormat(format)}
                    className={`rounded-md border p-2 text-left text-sm ${whatsAppFormat === format ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}
                  >
                    <FileText className="mb-1 h-4 w-4" />{label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Invoice Design</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["classic", "Ledger"],
                  ["modern", "Commerce"],
                  ["minimal", "Essential"],
                ] as Array<[InvoiceDesign, string]>).map(([design, label]) => (
                  <button
                    key={design}
                    type="button"
                    onClick={() => setWhatsAppDesign(design)}
                    className={`rounded-md border p-2 text-left text-sm ${whatsAppDesign === design ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}
                  >
                    <span className={`mb-2 block h-2 rounded-sm ${design === "modern" ? "bg-sky-800" : design === "minimal" ? "w-1/2 bg-slate-300" : "bg-black"}`} />
                    {label}
                  </button>
                ))}
              </div>
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
