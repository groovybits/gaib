import React, { useState, useEffect } from 'react';
import styles from '@/styles/Home.module.css';

const TermsPopup: React.FC = () => {
	const [showPopup, setShowPopup] = useState(false);

	useEffect(() => {
		const acceptedTerms = localStorage.getItem('acceptedTerms');
		if (!acceptedTerms) {
			setShowPopup(true);
		}
	}, []);

	const handleAccept = (event: { preventDefault: () => void; }) => {
		event.preventDefault();
		localStorage.setItem('acceptedTerms', 'true');
		setShowPopup(false);
	};

	if (!showPopup) {
		return null;
	}

	return (
		<div className={styles.cloud} style={{
			position: 'fixed',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			backgroundColor: 'rgba(0,0,0,0.5)',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center'
		}}>
			<div style={{
				position: 'relative',
				width: '90%',
				maxWidth: '800px',
				padding: '20px',
				background: '#fff',
				overflowY: 'auto',
				maxHeight: '90%'
			}}>
				<h2>Welcome to GAIB The Groovy AI Bot</h2>

				<p>Currently Access is only by request, please ask on the Twitch channel for information on access.</p>

				<p>Please read our Terms of Service carefully. By using this website, you agree to the Terms of Service.</p>
				<p>
					You are responsible for all content you post on GAIB The Groovy AI Bot (&apos;User Content&apos;). You represent and warrant that you own or have the necessary rights to post your User Content, and that your User Content does not violate any laws or the rights of others.
				</p>
				<p>
					We respect the intellectual property rights of others and expect our users to do the same. We will respond to allegations of copyright infringement in accordance with the Digital Millennium Copyright Act (DMCA) or other applicable laws.
				</p>
				<p>
					We reserve the right, but are not obligated, to monitor and moderate User Content. We may remove or modify any User Content at any time for any reason, including if we believe it violates these Terms, our policies, or any laws.
				</p>
				<p>
					We collect and use personal information in accordance with our Privacy Policy. By using GAIB The Groovy AI Bot, you consent to such collection and use.
				</p>
				<p>
					GAIB The Groovy AI Bot is not intended for use by children under the age of 13. If we learn that we have collected personal information from a child under 13, we will delete that information as quickly as possible.
				</p>
				<p>
					We may modify these Terms at any time. We will post the revised Terms on GAIB The Groovy AI Bot and update the &apos;Last Updated&apos; date. By continuing to use GAIB The Groovy AI Bot after we post revised Terms, you agree to those changes.
				</p>
				<p>
					Any disputes arising out of or relating to these Terms or your use of GAIB The Groovy AI Bot will be governed by the laws of California, without regard to its conflict of laws rules.
				</p>
				<button className={styles.header} onClick={handleAccept}>I Agree</button>
			</div>
		</div>
	);
};

export default TermsPopup;