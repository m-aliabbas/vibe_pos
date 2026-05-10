"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { formatPakistanDateTime } from "@/lib/utils";
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
  const [saleReturns, setSaleReturns] = useState<ReturnRecord[]>([]);
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

      setSaleReturns(returnsData);
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

      // Fetch customer data if customer_id is present
      let customerData = null;
      if (saleData.customer_id) {
        try {
          const customerResponse = await api.get(`/customers/${saleData.customer_id}`);
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

  const formatDate = (dateString: string): string => {
    return formatPakistanDateTime(dateString);
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
      <div className="container mx-auto p-8 flex items-center justify-center h-full">
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

  return (
    <div className="bg-gray-50">
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
          <div className="p-4 text-sm">
            {/* Store Header - Centered */}
            <div className="text-center border-b-2 border-dashed border-gray-400 pb-3 mb-3">
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                {storeInfo.name}
              </h1>
              {storeInfo.address && (
                <p className="text-xs text-gray-600">{storeInfo.address}</p>
              )}
              {storeInfo.city && (
                <p className="text-xs text-gray-600">{storeInfo.city}</p>
              )}
              {storeInfo.phone && (
                <p className="text-xs text-gray-600">{storeInfo.phone}</p>
              )}
              {storeInfo.email && (
                <p className="text-xs text-gray-600">{storeInfo.email}</p>
              )}
              {storeInfo.taxId && (
                <p className="text-xs text-gray-600">Tax ID: {storeInfo.taxId}</p>
              )}
            </div>

            {/* Invoice Info */}
            <div className="text-center mb-3 pb-3 border-b border-dashed border-gray-300">
              <h2 className="text-lg font-bold text-gray-900 mb-1">INVOICE</h2>
              <p className="text-xs text-gray-600">
                #{formatInvoiceNumber(sale.id)}
              </p>
              <p className="text-xs text-gray-600">
                {formatDate(sale.created_at)}
              </p>
              <p className="text-xs text-gray-600">
                Cashier: {sale.user?.full_name || sale.user?.username || "N/A"}
              </p>
            </div>

            {/* Customer Info */}
            <div className="mb-3 pb-3 border-b border-dashed border-gray-300">
              <p className="text-xs font-semibold text-gray-600 mb-1">CUSTOMER:</p>
              <p className="text-sm font-medium text-gray-900">
                {sale.customer_name || "Walk-in Customer"}
              </p>
            </div>

            {/* Vehicle Info (Oil Change Details) */}
            {sale.customer && (sale.customer.current_mileage || sale.customer.oil_change_interval) && (
              <div className="mb-3 pb-3 border-b border-dashed border-gray-300">
                <p className="text-xs font-semibold text-gray-600 mb-1">VEHICLE INFO:</p>
                {sale.customer.current_mileage && (
                  <div className="flex justify-between text-xs text-gray-700">
                    <span>Current KM:</span>
                    <span className="font-medium">{sale.customer.current_mileage.toLocaleString()}</span>
                  </div>
                )}
                {sale.customer.oil_change_interval && (
                  <div className="flex justify-between text-xs text-gray-700">
                    <span>Oil Interval:</span>
                    <span className="font-medium">{sale.customer.oil_change_interval.toLocaleString()} KM</span>
                  </div>
                )}
                {sale.customer.next_oil_change_mileage && (
                  <div className="flex justify-between text-xs text-green-700 font-semibold mt-1">
                    <span>Next Oil Change:</span>
                    <span>{sale.customer.next_oil_change_mileage.toLocaleString()} KM</span>
                  </div>
                )}
              </div>
            )}

            {/* Items */}
            <div className="mb-3 pb-3 border-b-2 border-dashed border-gray-400">
              <p className="text-xs font-semibold text-gray-600 mb-2">ITEMS:</p>
              {sale.items.map((item, index) => (
                <div key={item.id} className="mb-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-gray-900 flex-1">
                      {item.product_name || item.product?.name || `Product #${item.product_id}`}
                    </span>
                  </div>
                  {(item.variation_attributes || item.variation?.attributes) && (
                    <div className="text-xs text-purple-600 mb-1">
                      {Object.entries(item.variation_attributes || item.variation!.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </div>
                  )}
                  {item.variation?.sku && (
                    <div className="text-xs text-gray-500 mb-1">
                      SKU: {item.variation.sku}
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{item.quantity} {item.unit} x rs {item.unit_price.toFixed(2)}</span>
                    <span className="text-gray-700">
                      rs {(item.unit_price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                  {item.item_discount && item.item_discount > 0 && (
                    <div className="flex justify-between text-xs text-gray-900">
                      <span>Discount:</span>
                      <span>-rs {item.item_discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-semibold mt-1">
                    <span className="text-gray-900">Final Price:</span>
                    <span className="text-gray-900">
                      rs {item.total_price.toFixed(2)}
                    </span>
                  </div>
                  {(returnedBySaleItem[item.id] || 0) > 0 && (
                    <div className="text-xs text-orange-600 mt-1">
                      Returned: {returnedBySaleItem[item.id]} {item.unit}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">
                  rs {sale.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0).toFixed(2)}
                </span>
              </div>

              {(sale.discount > 0 || sale.items.some(item => (item.item_discount || 0) > 0)) && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Discount:</span>
                    <span className="font-medium text-gray-900">
                      -rs {(sale.discount + sale.items.reduce((sum, item) => sum + (item.item_discount || 0), 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t pt-1">
                    <span className="text-gray-700">After Discount:</span>
                    <span className="text-gray-900">
                      rs {sale.subtotal.toFixed(2)}
                    </span>
                  </div>
                </>
              )}

              {sale.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax:</span>
                  <span className="font-medium text-gray-900">
                    rs {sale.tax.toFixed(2)}
                  </span>
                </div>
              )}

              {sale.delivery_charges > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery:</span>
                  <span className="font-medium text-gray-900">
                    rs {sale.delivery_charges.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-900">
                <span className="text-gray-900">TOTAL TO PAY:</span>
                <span className="text-gray-900">
                  rs {sale.total.toFixed(2)}
                </span>
              </div>
              {returnRefundTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Returned (Refunded):</span>
                  <span className="font-medium text-red-600">
                    -rs {returnRefundTotal.toFixed(2)}
                  </span>
                </div>
              )}
              {returnRefundTotal > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700">Net Total:</span>
                  <span className="text-gray-900">
                    rs {(sale.total - returnRefundTotal).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Payment Details */}
            <div className="mb-3 pb-3 border-b border-dashed border-gray-300">
              <p className="text-xs font-semibold text-gray-600 mb-2">PAYMENT:</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Method:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {sale.payment_method}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Paid:</span>
                  <span className="font-medium text-gray-900">
                    rs {sale.amount_paid.toFixed(2)}
                  </span>
                </div>
                {sale.change_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Change:</span>
                    <span className="font-semibold text-green-600">
                      rs {sale.change_amount.toFixed(2)}
                    </span>
                  </div>
                )}
                {sale.amount_due > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Due:</span>
                    <span className="font-semibold text-red-600">
                      rs {sale.amount_due.toFixed(2)}
                    </span>
                  </div>
                )}
                {returnRefundTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Net Due:</span>
                    <span className="font-semibold text-red-600">
                      rs {Math.max(0, sale.amount_due - returnRefundTotal).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-3 border-t-2 border-dashed border-gray-400">
              <p className="text-xs text-gray-600 mb-1">
                Thank you for your business!
              </p>
              {storeInfo.website && (
                <p className="text-xs text-gray-500">
                  {storeInfo.website}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                VibePOS (by vibeexe.com)
              </p>
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
