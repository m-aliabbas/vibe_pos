from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Sales Reports
class PeriodData(BaseModel):
    period: str
    transactions: int
    revenue: float

class SalesSummaryReport(BaseModel):
    total_revenue: float
    transaction_count: int
    average_transaction: float
    period_data: List[PeriodData]

class ProductData(BaseModel):
    product_name: str
    sku: Optional[str]
    total_revenue: float
    total_quantity: float

class TopProductsReport(BaseModel):
    by_revenue: List[ProductData]
    by_quantity: List[ProductData]

class ProductSalesHistoryItem(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    category: Optional[str]
    company: Optional[str]
    base_unit: str
    purchased_quantity: float
    sold_quantity: float
    purchase_cost: float
    sales_revenue: float
    cost_of_goods_sold: float
    profit_loss: float
    purchase_orders: int
    sales_transactions: int

class ProductSalesHistorySummary(BaseModel):
    matched_products: int
    purchased_quantity: float
    sold_quantity: float
    purchase_cost: float
    sales_revenue: float
    cost_of_goods_sold: float
    profit_loss: float

class ProductSalesHistoryReport(BaseModel):
    products: List[ProductSalesHistoryItem]
    summary: ProductSalesHistorySummary
    search: str
    product_id: Optional[int]
    category: Optional[str]
    company: Optional[str]
    total_matching_products: int
    truncated: bool
    period_start: str
    period_end: str


# Consolidated Reports & Analytics dashboard
class AnalyticsStockItem(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    category: Optional[str]
    current_stock: float
    threshold: int
    base_unit: str


class AnalyticsExpiredBatch(BaseModel):
    batch_id: int
    batch_number: str
    product_id: int
    product_name: str
    sku: Optional[str]
    category: Optional[str]
    company: Optional[str]
    quantity_remaining: float
    base_unit: str
    expiry_date: str
    days_expired: int
    stock_value: float


class AnalyticsProductSale(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    quantity_sold: float
    revenue: float


class AnalyticsMonthlySale(BaseModel):
    month: str
    quantity_sold: float
    revenue: float


class AnalyticsVendorPurchase(BaseModel):
    vendor_id: int
    vendor_name: str
    purchase_count: int
    total_bought: float


class AnalyticsVendorPrice(BaseModel):
    vendor_id: int
    vendor_name: str
    quantity_bought: float
    average_unit_cost: float


class AnalyticsProductPriceComparison(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    lowest_price: float
    highest_price: float
    price_difference: float
    vendors: List[AnalyticsVendorPrice]


class AnalyticsOutstandingVendor(BaseModel):
    vendor_id: int
    vendor_name: str
    phone: Optional[str]
    outstanding_amount: float


class AnalyticsCustomer(BaseModel):
    customer_id: int
    customer_name: str
    phone: Optional[str]
    transaction_count: int
    total_bought: float
    outstanding_amount: float


class AnalyticsOverviewReport(BaseModel):
    period_start: str
    period_end: str
    top_n: int
    months: int
    low_stock: List[AnalyticsStockItem]
    out_of_stock: List[AnalyticsStockItem]
    expired_batches: List[AnalyticsExpiredBatch]
    low_stock_count: int
    out_of_stock_count: int
    expired_batch_count: int
    most_selling: List[AnalyticsProductSale]
    least_selling: List[AnalyticsProductSale]
    monthly_sales: List[AnalyticsMonthlySale]
    top_vendors: List[AnalyticsVendorPurchase]
    vendor_price_comparisons: List[AnalyticsProductPriceComparison]
    outstanding_vendors: List[AnalyticsOutstandingVendor]
    outstanding_customers: List[AnalyticsCustomer]
    top_customers: List[AnalyticsCustomer]

class PaymentMethodData(BaseModel):
    method: str
    transaction_count: int
    total_amount: float

class PaymentMethodReport(BaseModel):
    payment_methods: List[PaymentMethodData]

class CashierData(BaseModel):
    username: str
    full_name: Optional[str]
    transaction_count: int
    total_revenue: float
    average_transaction: float

class CashierPerformanceReport(BaseModel):
    cashiers: List[CashierData]

class CustomerSale(BaseModel):
    id: int
    created_at: str
    total: float
    payment_method: str
    cashier: str
    items_count: int

class CustomerSalesReport(BaseModel):
    customer_phone: str
    normalized_phone: str
    total_spent: float
    total_transactions: int
    sales: List[CustomerSale]

class TrendData(BaseModel):
    period: str
    transactions: int
    revenue: float
    avg_transaction: float

class SalesTrendReport(BaseModel):
    period: str
    data: List[TrendData]

# Inventory Reports
class StockLevel(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    current_stock: int
    base_unit: str
    category: Optional[str]
    selling_price: float

class StockLevelReport(BaseModel):
    products: List[StockLevel]
    total_products: int
    low_stock_count: int

class LowStockAlert(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    current_stock: float
    threshold: int
    base_unit: str
    category: Optional[str]

class InventoryTurnoverReport(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    turnover_ratio: float
    sold_quantity: int
    average_stock: float
    period_days: int

class StockMovement(BaseModel):
    date: str
    movement_type: str  # 'sale', 'purchase', 'adjustment'
    quantity: int
    reference: str  # sale_id, purchase_id, etc.
    balance_after: int

class StockMovementReport(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    movements: List[StockMovement]
    current_stock: int

class ProductPerformance(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    sold_quantity: int
    revenue: float
    avg_daily_sales: float
    stock_turnover_days: Optional[float]

class ProductPerformanceReport(BaseModel):
    products: List[ProductPerformance]
    period_days: int

class VariationStock(BaseModel):
    variation_id: int
    attributes: dict
    sku: Optional[str]
    current_stock: int
    price_adjustment: float

class VariationStockReport(BaseModel):
    product_id: int
    product_name: str
    variations: List[VariationStock]
    total_stock: int

# Financial Reports
class ProfitLossItem(BaseModel):
    category: str
    amount: float
    description: str

class ProfitLossReport(BaseModel):
    revenue: float
    cost_of_goods_sold: float
    gross_profit: float
    expenses: List[ProfitLossItem]
    net_profit: float
    period_start: str
    period_end: str

class ExpenseItem(BaseModel):
    date: str
    category: str
    amount: float
    description: str
    vendor: Optional[str]

class ExpenseReport(BaseModel):
    total_expenses: float
    expenses: List[ExpenseItem]
    category_breakdown: dict

class CashFlowItem(BaseModel):
    date: str
    type: str  # 'inflow', 'outflow'
    category: str
    amount: float
    description: str

class CashFlowReport(BaseModel):
    starting_balance: float
    ending_balance: float
    net_cash_flow: float
    inflows: List[CashFlowItem]
    outflows: List[CashFlowItem]

class RevenueBreakdownItem(BaseModel):
    category: str
    revenue: float
    quantity: int

class PaymentMethodBreakdownItem(BaseModel):
    payment_method: str
    revenue: float
    transactions: int

class RevenueBreakdownReport(BaseModel):
    by_category: List[RevenueBreakdownItem]
    by_payment_method: List[PaymentMethodBreakdownItem]

class MarginItem(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    selling_price: float
    purchase_price: Optional[float]
    sold_quantity: int
    revenue: float
    cost_of_goods: float
    profit: float
    margin_percentage: float

class MarginSummary(BaseModel):
    total_revenue: float
    total_cost: float
    total_profit: float
    overall_margin_percentage: float

class MarginAnalysisReport(BaseModel):
    products: List[MarginItem]
    summary: MarginSummary

class OutstandingPayment(BaseModel):
    customer_name: Optional[str]
    customer_phone: Optional[str]
    sale_id: int
    amount_due: float
    due_date: Optional[str]
    days_overdue: int

class OutstandingPaymentReport(BaseModel):
    total_outstanding: float
    payments: List[OutstandingPayment]
    count: int

class VendorPayment(BaseModel):
    vendor_id: int
    vendor_name: str
    total_purchases: float
    total_paid: float
    outstanding_amount: float
    payment_status: str

class VendorPaymentReport(BaseModel):
    vendors: List[VendorPayment]
    total_outstanding: float

class PrepaidCredit(BaseModel):
    vendor_id: int
    vendor_name: str
    credit_amount: float
    last_updated: str

class PrepaidCreditReport(BaseModel):
    total_credits: float
    credits: List[PrepaidCredit]

# Purchase Reports
class PurchaseItem(BaseModel):
    id: int
    created_at: str
    vendor_name: str
    total_amount: float
    payment_status: str
    items_count: int

class PurchaseHistoryReport(BaseModel):
    purchases: List[PurchaseItem]
    total_amount: float
    count: int

class VendorPerformance(BaseModel):
    vendor_id: int
    vendor_name: str
    total_purchases: float
    purchase_count: int
    average_order_value: float
    payment_reliability: str

class VendorPerformanceReport(BaseModel):
    vendors: List[VendorPerformance]

class PurchaseTrend(BaseModel):
    period: str
    purchase_count: int
    total_amount: float
    avg_order_value: float

class PurchaseTrendReport(BaseModel):
    period: str
    data: List[PurchaseTrend]

class ProductCostItem(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str]
    avg_purchase_price: float
    min_purchase_price: float
    max_purchase_price: float
    total_purchased_quantity: int

class ProductCostReport(BaseModel):
    products: List[ProductCostItem]

class PurchaseTimelineItem(BaseModel):
    period: str
    purchase_count: int
    total_amount: float
    avg_purchase_amount: float

class PurchaseTimelineReport(BaseModel):
    period: str
    data: List[PurchaseTimelineItem]

class ProductPurchase(BaseModel):
    product_name: str
    total_quantity: int
    total_cost: float
    avg_unit_cost: float
    vendors: List[str]

class ProductPurchaseReport(BaseModel):
    products: List[ProductPurchase]

class PurchasePaymentStatus(BaseModel):
    status: str
    count: int
    total_amount: float
    percentage: float

class PurchasePaymentStatusReport(BaseModel):
    statuses: List[PurchasePaymentStatus]

class VendorPurchaseItem(BaseModel):
    vendor_id: int
    vendor_name: str
    contact_person: Optional[str]
    purchase_count: int
    total_amount: float
    avg_purchase_amount: float

class VendorPurchaseReport(BaseModel):
    vendors: List[VendorPurchaseItem]

# User Reports
class UserCashierPerformanceReport(BaseModel):
    username: str
    full_name: Optional[str]
    transaction_count: int
    total_revenue: float
    average_transaction: float
    period_days: int

class UserActivity(BaseModel):
    timestamp: str
    action: str
    details: dict
    ip_address: Optional[str]

class UserActivityReport(BaseModel):
    user_id: int
    username: str
    activities: List[UserActivity]
    total_actions: int

class UserPerformanceItem(BaseModel):
    user_id: int
    username: str
    role: str
    sales_count: int
    total_revenue: float
    avg_sale_value: float
    daily_avg_sales: float
    items_sold: int

class UserPerformanceReport(BaseModel):
    users: List[UserPerformanceItem]
    period_days: int

class UserLoginHistory(BaseModel):
    timestamp: str
    action: str
    ip_address: Optional[str]
    user_agent: Optional[str]

class AdminAction(BaseModel):
    timestamp: str
    admin_username: str
    action: str
    target_type: str
    target_id: Optional[int]
    details: dict

class AdminAuditReport(BaseModel):
    actions: List[AdminAction]
    total_actions: int


class LedgerEntry(BaseModel):
    date: datetime
    description: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    debit: float
    credit: float
    balance: float


class LedgerReport(BaseModel):
    opening_balance: float
    closing_balance: float
    entries: List[LedgerEntry]
