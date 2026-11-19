export const BUILTIN_PAGES = {
  privacy: {
    title: "Privacy policy",
    html: `<p>Intube Media operates Intube Drama at intubedrama.com. We use account details such as your email address or phone number to provide sign-in and account services. We also store activity needed to provide the service, such as watch progress, saved series, coin balance, and subscription status.</p>
<p>Payments are processed by Razorpay. We do not store your card number or card security code. Razorpay handles payment details under its own terms and privacy information.</p>
<p>The app may use Google AdMob to show ads and Firebase to support app services and push notifications. If you register a device for notifications, we store its push token so we can deliver messages. Google services may process information as described in Google’s privacy information.</p>
<h2>Delete your account</h2>
<p>To delete your account, visit <a href="https://intubedrama.com/account/delete">https://intubedrama.com/account/delete</a>. We remove personal profile and activity data. Purchase, payment, subscription, coin, episode-unlock, and trial-abuse-prevention records may be retained where needed for legal, accounting, and fraud-prevention purposes.</p>`,
  },
  terms: {
    title: "Terms of use",
    html: `<p>Intube Drama is operated by Intube Media and provides access to short-form video stories at intubedrama.com. Keep your account sign-in information secure and use the service in a lawful way.</p>
<p>Some features may require a paid subscription or coins. Subscription plans renew automatically until canceled. You can manage or cancel a subscription through the account subscription options; contact us if you need help.</p>
<p>Coins are used for eligible in-app features. Coin purchases are non-refundable except for failed or duplicate charges, as described in our refund policy.</p>
<p>For questions about these terms, contact <a href="mailto:intubemediaofficial@gmail.com">intubemediaofficial@gmail.com</a>.</p>`,
  },
  "refund-policy": {
    title: "Refund policy",
    html: `<p>Payments for subscriptions and coin packs are processed by Razorpay. We do not store card details.</p>
<p>Coin purchases are non-refundable, except when a charge failed but money was debited or when the same charge was collected more than once. Contact us with the account email or phone number and payment reference so we can review the issue.</p>
<p>Canceling a subscription stops future renewals; it does not by itself reverse a payment already processed. For a billing question, email <a href="mailto:intubemediaofficial@gmail.com">intubemediaofficial@gmail.com</a>.</p>`,
  },
  contact: {
    title: "Contact Intube Media",
    html: `<p>For account, payment, privacy, or deletion requests, email us:</p>
<p><a href="mailto:intubemediaofficial@gmail.com">intubemediaofficial@gmail.com</a></p>
<p>Website: intubedrama.com</p>`,
  },
} as const;

export type BuiltInPageSlug = keyof typeof BUILTIN_PAGES;
