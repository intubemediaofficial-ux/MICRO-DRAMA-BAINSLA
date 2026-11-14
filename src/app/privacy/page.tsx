import PolicyPage from "@/components/policy-page";

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy">
      <p>
        Intube Media operates Intube Drama at intubedrama.com. We use account details such as your
        email address or phone number to provide sign-in and account services. We also store
        activity needed to provide the service, such as watch progress, saved series, coin balance,
        and subscription status.
      </p>
      <p>
        Payments are processed by Razorpay. We do not store your card number or card security code.
        Razorpay handles payment details under its own terms and privacy information.
      </p>
      <p>
        The app may use Google AdMob to show ads and Firebase to support app services and push
        notifications. If you register a device for notifications, we store its push token so we
        can deliver messages. Google services may process information as described in Google’s
        privacy information.
      </p>
      <p>
        To delete your account, visit{" "}
        <a className="text-rose-300" href="https://intubedrama.com/account/delete">
          https://intubedrama.com/account/delete
        </a>
        . We remove personal profile and activity data. Purchase, payment, subscription, coin,
        episode-unlock, and trial-abuse-prevention records may be retained where needed for legal,
        accounting, and fraud-prevention purposes.
      </p>
    </PolicyPage>
  );
}
