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
        To ask us to delete your account and associated account data, email
        {" "}<a className="text-rose-300" href="mailto:intubemediaofficial@gmail.com">intubemediaofficial@gmail.com</a>.
        We may need to retain transaction records where required to handle payments or support
        requests.
      </p>
    </PolicyPage>
  );
}
