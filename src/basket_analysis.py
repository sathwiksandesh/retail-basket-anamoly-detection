"""Descriptive market-basket summaries from sampled order-product lines."""
import pandas as pd

def frequent_itemsets(order_products, products, min_support=0.01, max_items=3):
    """Optional Apriori summary; limits transactions and product vocabulary for memory safety."""
    from mlxtend.frequent_patterns import apriori
    from mlxtend.preprocessing import TransactionEncoder
    joined = order_products.merge(products[["product_id", "product_name"]], on="product_id", how="left")
    transactions = joined.groupby("order_id")["product_name"].apply(lambda s: list(dict.fromkeys(s.dropna().astype(str))))
    if transactions.empty: return pd.DataFrame(columns=["itemsets", "support"])
    te = TransactionEncoder()
    arr = te.fit(transactions.tolist()).transform(transactions.tolist())
    basket = pd.DataFrame(arr, columns=te.columns_)
    # Cap wide matrices: keep most frequent products, which keeps demo reproducible on a laptop.
    if basket.shape[1] > 300:
        keep = basket.sum().nlargest(300).index
        basket = basket[keep]
    return apriori(basket, min_support=min_support, use_colnames=True, max_len=max_items).sort_values("support", ascending=False)
